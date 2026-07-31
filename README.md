# Q Software Dashboard — Mobile App

Native iOS and Android shell for the [Q Software Dashboard](https://app.qsoftware.ca).

This repository contains **no Next.js code**. The dashboard lives in
`QSoftwareDevelopment/QSoftware-Dashboard` and is deployed to Vercel; this project wraps that
live deployment in a native container and adds the things a browser tab cannot do.

---

## Run it locally

### First time

```bash
git clone git@github-qsoft:QSoftwareDevelopment/QSoftware-Dashboard-App.git
cd QSoftware-Dashboard-App
npm install
npm run doctor      # tells you exactly what tooling is missing, before a build fails
```

### Android

Requires **JDK 21** and the Android SDK. Capacitor 7 compiles at source level 21 — JDK 17 fails
with `invalid source release: 21`, which is the single most likely thing to go wrong.

```bash
brew install openjdk@21                             # formula, not cask — no sudo needed
brew install --cask android-commandlinetools
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH="$ANDROID_HOME/platform-tools:$PATH"
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
```

Then, with a device plugged in (USB debugging on) or an emulator running:

```bash
npm run run:android      # builds the shell, syncs, installs, launches
```

Or build an APK without a device:

```bash
npm run sync
cd android && ./gradlew assembleDebug
# -> android/app/build/outputs/apk/debug/app-debug.apk
```

### iOS

Requires **full Xcode** — Command Line Tools alone cannot build an app, and `pod install`
fails without it.

```bash
# Install Xcode from the App Store, then:
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
brew install cocoapods

cd ios/App && pod install && cd ../..
npm run run:ios          # or: npm run open:ios  to drive it from Xcode
```

In Xcode, set your signing team on the **App** target before running on a physical device.

### Day-to-day

The dashboard is remote, so **web changes need no rebuild** — deploy the dashboard and the app
picks them up on next load. Rebuild only when this repo changes:

```bash
npm run sync     # rebuild src/shell -> www/shell.js, copy into both native projects
```

---

## How it works

```
┌────────────────────────────────────────────┐
│  native shell (this repo)                  │
│    splash · status bar · push · haptics    │
│    deep links · back button · offline      │
│                                            │
│   ┌────────────────────────────────────┐   │
│   │ WebView                            │   │
│   │   https://app.qsoftware.ca         │◄──┼── live Vercel deployment
│   │   (real SSR, real auth, 98 APIs)   │   │
│   └────────────────────────────────────┘   │
│           │                                │
│           └── off-origin → system browser  │
└────────────────────────────────────────────┘
```

`capacitor.config.ts` sets `server.url`, so the WebView's origin **is** `app.qsoftware.ca`.
Supabase's SSR cookies are therefore first-party, `middleware.ts` sees a signed-in user exactly
as a desktop browser does, and sign-in survives cold starts with no token bridging.

### Why not a static bundle

Capacitor normally ships `next build && next export` output inside the binary. The dashboard
cannot be exported: `middleware.ts` does the Supabase cookie auth (static export forbids
middleware outright), 98 route handlers under `app/api/**` are server-only, and dynamic
segments like `/book/[slug]` resolve per-request from the database. See
[the design spec](docs/superpowers/specs/2026-07-31-capacitor-dashboard-app-design.md).

### The shell

The dashboard is served from another repository, so this project cannot add a `<script>` tag to
it. The shell is injected by native code instead:

| Platform | Mechanism |
|---|---|
| iOS | [`ShellViewController.swift`](ios/App/App/ShellViewController.swift) adds a `WKUserScript` in `capacitorDidLoad()` — before the first navigation, so it covers every load |
| Android | [`MainActivity.java`](android/app/src/main/java/ca/qsoftware/dashboard/MainActivity.java) evaluates the bundle in `WebViewListener.onPageLoaded` |

Each capability is an independent module under [`src/shell/`](src/shell/) exporting one
`install()`, composed in [`index.ts`](src/shell/index.ts) and individually guarded — one
failure never cascades into the dashboard.

| Module | Does |
|---|---|
| `boot.ts` | Hides the splash on first paint; syncs the status bar to light/dark |
| `safe-area.ts` | Notch and home-indicator padding; suppresses web-page tells |
| `links.ts` | Off-origin URLs → system browser. **Required**: Google returns `disallowed_useragent` for OAuth inside a WebView |
| `back.ts` | Android back pops history and closes modals instead of killing the app |
| `deeplinks.ts` | Universal Links / App Links routing |
| `network.ts` | Mid-session offline banner; reloads on reconnect unless input is unsaved |
| `push.ts` | Registration, token upload, tap-to-route. Fails soft without credentials |
| `haptics.ts` | Light tap on interactive controls; respects reduced-motion |

Cold-start offline is handled by `server.errorPath` in `capacitor.config.ts` rather than by the
shell — a page that never loaded cannot run JavaScript. Both platforms gate that on the **main
frame** failing, so a 404 on an image does not trigger it.

---

## Push notifications

Wired but **inert until credentials are added** — the app builds, installs, and runs fully
without them. See [SETUP.md](SETUP.md) for APNs and Firebase setup, and for the one endpoint
the dashboard still needs (`POST /api/user/push-token`).

---

## Branding

`assets/` holds the icon and splash sources; `npm run assets` expands them into all 176
platform sizes. To use a real logo, replace `assets/icon.png` (1024×1024) and
`assets/splash.png` (2732×2732) and re-run. The current placeholder is generated
geometrically by `scripts/make-brand-assets.py` in the dashboard's indigo→violet brand.

---

## Layout

```
capacitor.config.ts    server.url, errorPath, plugin config
src/shell/             injected native layer (TypeScript)
www/                   bundled assets: boot screen, offline page, built shell.js
ios/                   Xcode project — ShellViewController, AppDelegate push bridge
android/               Gradle project — MainActivity, App Links manifest
assets/                icon + splash sources
scripts/               shell bundler, brand asset generator, environment doctor
docs/                  design spec
```

`ios/` and `android/` are committed deliberately: they contain the shell injectors, the App
Links intent filter, the storyboard custom class, and the push entries in `Info.plist`. Running
`npx cap add` again would produce a stock project without any of it.
