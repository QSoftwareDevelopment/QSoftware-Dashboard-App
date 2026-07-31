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

### 2b. Service account — what the *server* needs

The app receives; the dashboard sends. The sender authenticates with a service account, not
with `google-services.json`.

1. Firebase Console → **Project settings → Service accounts → Generate new private key**.
   A JSON file downloads. **Treat it like a password** — it can send push to every one of your
   users. Do not commit it; `*.json` credentials are gitignored here for that reason.
2. In Vercel → the dashboard project → **Settings → Environment Variables**, add
   `FIREBASE_SERVICE_ACCOUNT` with the **entire JSON file contents** as the value, for
   Production and Preview.
3. Redeploy.

`lib/push.ts` parses it, signs a JWT with Web Crypto, and exchanges that for an access token
(cached for the hour it lasts). It restores `\n` inside `private_key` automatically — Vercel's
env storage flattens newlines, and the PEM is invalid without them, which is the most common
way this silently fails.

Verify it took:

```bash
# In the dashboard repo, against the deployed site
curl -s -o /dev/null -w '%{http_code}\n' https://app.qsoftware.ca/api/user/push-token \
  -X POST -H 'Content-Type: application/json' -d '{}'
# 401 = route is live and correctly rejecting an unauthenticated caller.
# 404 = the branch is not deployed yet.
```

---

## 3. APNs (iOS push)

Every step here is a browser or a file copy. **No Xcode required** — the capability that
normally needs it is already committed as entitlements files (see 3.4).

### 3.1 Register the App ID

[Certificates, Identifiers & Profiles → Identifiers](https://developer.apple.com/account/resources/identifiers/list)
→ **+** → App IDs → App.

- Bundle ID: **explicit**, `ca.qsoftware.dashboard`
- Tick **Push Notifications**
- Tick **Associated Domains** (for Universal Links, section 5)

If the ID already exists, edit it and tick both. Capabilities ticked here must match the
entitlements files or signing fails with a provisioning-profile mismatch.

### 3.2 Create the APNs key

[Keys](https://developer.apple.com/account/resources/authkeys/list) → **+** → name it
"Q Software Push" → enable **Apple Push Notifications service (APNs)** → Continue → Register →
**Download**.

> **Apple lets you download this exactly once.** Back it up somewhere durable now. Losing it
> means revoking and re-creating the key, and re-uploading to Firebase.

Note the **Key ID** (10 chars, also in the filename) and your **Team ID**
([Membership](https://developer.apple.com/account#MembershipDetailsCard), 10 chars).

### 3.3 Upload it to Firebase

Firebase Console → **Project settings → Cloud Messaging → Apple app configuration** →
**APNs Authentication Key → Upload** → the `.p8`, its Key ID, and your Team ID.

This is what lets one FCM credential reach iOS. The dashboard never talks to APNs directly.

Also add the Firebase **iOS app** (bundle ID `ca.qsoftware.dashboard`), download
`GoogleService-Info.plist`, and place it at `ios/App/App/GoogleService-Info.plist`. It is
gitignored — it must be provided at build time, so for CI add it as a base64 secret and write it
out in a step before `pod install`.

### 3.4 Entitlements — already done, do not re-add in Xcode

Ticking "Push Notifications" under Signing & Capabilities is the usual step and needs Xcode.
It is committed instead:

| File | Configuration | `aps-environment` |
|---|---|---|
| `ios/App/App/App.entitlements` | Debug | `development` |
| `ios/App/App/AppRelease.entitlements` | Release, TestFlight, App Store | `production` |

Both are wired via `CODE_SIGN_ENTITLEMENTS` in `project.pbxproj`.

**This split matters more than it looks.** APNs runs dev and production on completely separate
infrastructure. A build signed with the wrong `aps-environment` registers successfully, returns
a valid-looking token, and then receives nothing — no error, anywhere. If TestFlight push is
silent while debug builds work, this is the first thing to check.

`Info.plist` already declares the `remote-notification` background mode, and `AppDelegate.swift`
already bridges APNs registration into the plugin's NotificationCenter events. Without those two
bridges the plugin's `registration` event never fires and no token ever reaches the server —
also silently.

### 3.5 Provisioning profile

[Profiles](https://developer.apple.com/account/resources/profiles/list) → **+** →
**App Store Connect** distribution → select the App ID → your distribution certificate →
download. Base64 it into the `IOS_PROVISIONING_PROFILE` secret (section 6).

> Push cannot be tested on the iOS Simulator — it has no APNs connection. Use a physical device
> via TestFlight.

---

## 4. Dashboard server side — done, needs deploying

Built on the `feat/push-tokens` branch of `QSoftwareDevelopment/QSoftware-Dashboard`:

| File | What |
|---|---|
| `MIGRATION_v27.sql` | `push_tokens` table, RLS, `retire_push_token()` |
| `app/api/user/push-token/route.ts` | `POST` registers, `DELETE` clears on sign-out |
| `lib/push.ts` | `pushToProfile()` / `pushToBusiness()` via FCM HTTP v1 |
| `app/api/textbot/voice/route.ts` | Missed call → notification, fire-and-forget |

To activate:

1. Merge the branch.
2. Run `MIGRATION_v27.sql` in the Supabase SQL editor.
3. Set `FIREBASE_SERVICE_ACCOUNT` in Vercel (section 2 below produces it).

Until step 3 the sender is inert — no push, no crash, no log noise.

FCM reaches **both** platforms: Android directly, iOS via APNs once the `.p8` is uploaded to
Firebase. One credential, one code path — the server never talks to APNs itself.

### Notification shape

`src/shell/push.ts` routes taps on `data.path`:

```json
{
  "notification": { "title": "Missed call", "body": "519 (Kitchener) — we texted them back" },
  "data": { "path": "/dashboard/textbot/calls" }
}
```

The path must start with a single `/`. Anything else is ignored, on both the sending and
receiving side — so a malformed or hostile push cannot redirect the WebView off-origin.

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

## 6. CI secrets — shipping iOS without Xcode

`.github/workflows/ios.yml` compiles unsigned on every push, needing no Apple account. Signing
and TestFlight upload are a separate opt-in job, skipped until these secrets exist, so their
absence never turns the repo's checks red.

Add under **Settings → Secrets and variables → Actions**:

| Secret | Where it comes from |
|---|---|
| `APPLE_TEAM_ID` | [Membership](https://developer.apple.com/account#MembershipDetailsCard) |
| `IOS_DIST_CERT_P12` | Distribution cert exported from Keychain Access, base64 |
| `IOS_DIST_CERT_PASSWORD` | The password you set during that export |
| `IOS_KEYCHAIN_PASSWORD` | Any random string — a throwaway keychain per CI run |
| `IOS_PROVISIONING_PROFILE` | The profile from 3.5, base64 |
| `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` | [App Store Connect → Users and Access → Integrations](https://appstoreconnect.apple.com/access/integrations/api) |

Base64 a file for pasting:

```bash
base64 -i dist.p12 | pbcopy
```

The App Store Connect API key is used instead of an Apple ID password: scoped, revocable, and
unaffected by 2FA.

Then **Actions → iOS → Run workflow → tick "testflight"**.

---

## 7. Store submission

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
| **TestFlight push silent, debug push works** | `aps-environment` mismatch. Release must be `production` — APNs runs dev and prod on separate infrastructure, and the wrong one returns a valid token that receives nothing. See 3.4 |
| Token never reaches the server | The app registers at launch, which on a fresh install is the login screen. `push.ts` retries after sign-in; if it still fails, check the endpoint returns 401 rather than 404 |
| `provisioning profile does not match entitlements` | A capability is ticked in one place and not the other. The App ID (3.1) and the entitlements files (3.4) must agree |
| CI: `Could not read script '.../cordova.variables.gradle'` | Android job ran `cap copy`. Capacitor gitignores its generated scaffolding, so CI needs `cap sync android` |
| CI: `scheme not found` | `App.xcscheme` left `xcshareddata/`. It must be shared, not a user scheme |
| Google sign-in shows `disallowed_useragent` | `src/shell/links.ts` did not install — the shell is not being injected |
| Offline page appears when online | A main-frame request failed. Check `server.url` and DNS, not `errorPath` |
