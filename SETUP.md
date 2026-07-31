# Setup

Everything the app needs that this repository cannot contain — credentials, signing identities,
and the one dashboard endpoint that does not exist yet.

**The app builds, installs, and runs without any of this.** Push notifications stay inert and
deep links fall back to the browser until each step is done. Nothing here blocks development.

---

## 1. Signing identities

### iOS

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/) ($99/yr).
2. In Xcode → **App** target → **Signing & Capabilities**, pick your team.
   Bundle ID is `ca.qsoftware.dashboard` — register it at
   [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list)
   if Xcode does not offer to.

### Android

Debug builds are signed automatically. For release:

```bash
keytool -genkey -v -keystore qsoftware-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias qsoftware
```

Store it **outside this repository** — `*.jks` is gitignored precisely so it never lands here.
Then create `android/key.properties` (also gitignored):

```properties
storeFile=/absolute/path/to/qsoftware-release.jks
storePassword=…
keyAlias=qsoftware
keyPassword=…
```

Keep a backup. Losing this keystore means you can never update the Play listing — Google
cannot re-sign it for you.

---

## 2. Firebase (Android push)

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. **Add app → Android**, package name `ca.qsoftware.dashboard`.
3. Download `google-services.json` → `android/app/google-services.json`.
4. Add the Gradle plugin. In `android/build.gradle`, inside `buildscript { dependencies { … } }`:

   ```gradle
   classpath 'com.google.gms:google-services:4.4.2'
   ```

   And at the **bottom** of `android/app/build.gradle`:

   ```gradle
   apply plugin: 'com.google.gms.google-services'
   ```

Until step 4, `firebase-messaging` is on the classpath but never initialises, so registration
fails with a single logged warning and the app carries on. That is the intended state.

---

## 3. APNs (iOS push)

1. [Apple Developer → Keys](https://developer.apple.com/account/resources/authkeys/list) →
   **+** → enable **Apple Push Notifications service (APNs)** → download the `.p8`.
   **Apple lets you download it once.** Back it up.
2. In Firebase → **Project settings → Cloud Messaging → Apple app configuration**, upload the
   `.p8` with its Key ID and your Team ID.
3. Add the **Push Notifications** capability in Xcode → **App** target → Signing & Capabilities.
4. Add the Firebase iOS app (bundle ID `ca.qsoftware.dashboard`), download
   `GoogleService-Info.plist`, and drag it into `ios/App/App/` in Xcode with
   *Copy items if needed* checked.

`Info.plist` already declares the `remote-notification` background mode, and `AppDelegate.swift`
already bridges APNs registration to the plugin's NotificationCenter events — without those two
bridges the plugin's `registration` event never fires and no token ever reaches the server,
silently.

> Push cannot be tested on the iOS Simulator. Use a physical device.

---

## 4. Dashboard endpoint — `POST /api/user/push-token`

**This does not exist yet.** `src/shell/push.ts` posts the device token to it; until the route
is added it logs one warning per launch and does nothing else.

Add to `QSoftwareDevelopment/QSoftware-Dashboard` at `app/api/user/push-token/route.ts`:

```ts
// Same-origin request from the app's WebView, so the Supabase session cookie
// identifies the user and the token is attributed to the right business.
export async function POST(request: Request) {
  const { token, platform } = await request.json()
  // …resolve the session with the existing Supabase server client,
  //   then upsert on (user_id, token) so re-registration is idempotent.
}
```

Suggested table:

```sql
create table push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  token       text not null,
  platform    text not null check (platform in ('ios', 'android')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, token)
);
alter table push_tokens enable row level security;
```

Tokens rotate. Prune on send when FCM/APNs reports one unregistered, or the table grows
stale entries that quietly inflate delivery failure rates.

### Sending

`src/shell/push.ts` routes taps using `data.path`:

```json
{
  "notification": { "title": "Missed call", "body": "New voicemail from (519) 555-0134" },
  "data": { "path": "/dashboard/textbot/calls" }
}
```

The value must start with a single `/`. Anything else is ignored — that check is deliberate,
so a compromised or malformed push cannot redirect the WebView off-origin.

---

## 5. Deep links (Universal Links / App Links)

Both need a file served from the dashboard's domain. Until then links open in the browser and
everything else still works.

### Android — `https://app.qsoftware.ca/.well-known/assetlinks.json`

```bash
keytool -list -v -keystore qsoftware-release.jks -alias qsoftware | grep SHA256
```

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "ca.qsoftware.dashboard",
    "sha256_cert_fingerprints": ["<SHA256 from above>"]
  }
}]
```

The manifest already carries the `autoVerify` intent filter. If you use Play App Signing, take
the fingerprint from **Play Console → Setup → App integrity**, not from your local keystore —
Google re-signs the upload and the two differ. This is the most common reason verification
silently fails.

### iOS — `https://app.qsoftware.ca/.well-known/apple-app-site-association`

Served as `application/json`, **no `.json` extension**, no redirects.

```json
{
  "applinks": {
    "details": [{
      "appIDs": ["<TEAM_ID>.ca.qsoftware.dashboard"],
      "components": [{ "/": "/dashboard/*" }, { "/": "/booking/*" }, { "/": "/book/*" }]
    }]
  }
}
```

Then add the **Associated Domains** capability in Xcode with `applinks:app.qsoftware.ca`.

Next.js serves both from `public/.well-known/`. Note that `middleware.ts` currently matches
everything except `_next/*` and `api/*` — confirm these paths are reachable unauthenticated, or
Apple's CDN gets a redirect to `/login` and association fails.

---

## 6. Store submission

### App Store Review Guideline 4.2

A remote-URL app draws scrutiny as a "thin wrapper". The native layer is the answer, and it is
worth stating plainly in the review notes:

- Push notifications for missed calls — the product's core value, impossible in a browser
- Native splash, status bar, and safe-area handling
- Hardware back navigation with modal awareness (Android)
- Universal Links / App Links
- Offline detection with a bundled fallback
- Haptic feedback

Provide a working demo account. Reviewers will not sign up for a business dashboard, and
"cannot log in" is a rejection.

### Both stores

- Privacy policy URL — required by both, and the app collects a device token
- App Store: declare "Contact Info" and "Identifiers" under App Privacy if push is enabled
- Play: complete the Data Safety form to match

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `invalid source release: 21` | JDK 17 or 19 in use. Capacitor 7 needs JDK 21 — see README |
| `xcodebuild requires Xcode` | Command Line Tools only. Install full Xcode, then `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` |
| `[q-shell] shell.js missing` in logs | `www/shell.js` not built or not copied. Run `npm run sync` |
| App loads but no native behaviour | The iOS storyboard lost its `ShellViewController` custom class, or `MainActivity` was regenerated by `npx cap add android` |
| Push registration error on every launch | Expected until sections 2 and 3 are done |
| Google sign-in shows `disallowed_useragent` | `src/shell/links.ts` did not install — the shell is not being injected |
| Offline page appears when online | A main-frame request failed. Check `server.url` and DNS, not `errorPath` |
