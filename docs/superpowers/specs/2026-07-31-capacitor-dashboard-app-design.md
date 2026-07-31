# Q Software Dashboard — Capacitor Mobile App

Date: 2026-07-31
Status: approved, implementing
Source app: `QSoftwareDevelopment/QSoftware-Dashboard` (Next.js 14 App Router, deployed at `https://app.qsoftware.ca`)
Target repo: `QSoftwareDevelopment/QSoftware-Dashboard-App`

## Purpose

Ship the existing Q Software Dashboard to the App Store and Google Play as a native
application, without forking, rewriting, or degrading the web app that owners already use.

Success means: an owner installs the app, signs in once, and gets the dashboard they know —
plus the things a browser tab cannot give them (push alerts for missed calls, a home-screen
icon, offline feedback instead of a blank page).

## Why not static export

Capacitor's documented happy path is `next build` with `output: 'export'`, producing a static
`www/` bundle shipped inside the binary. That path is closed here:

- `middleware.ts` performs Supabase SSR cookie auth and admin HMAC session verification.
  Static export **forbids middleware entirely**.
- 98 route handlers under `app/api/**` (Stripe, Supabase, googleapis, Anthropic, Square,
  Resend, Twilio/WhatsApp) are server-only. Export drops them.
- Dynamic segments (`/book/[slug]`, `/booking/[token]`, `/menu/[slug]`, `/widget/[key]`)
  resolve per-request from the database and cannot be enumerated at build time.

Converting would mean deleting the auth layer, rehosting all 98 endpoints, and rewriting SSR
pages as client components — weeks of work that damages the web product to serve the mobile
one. Rejected.

## Architecture

A standalone Capacitor project containing **no Next.js code**. The native WebView loads the
live deployment; Capacitor injects its native bridge into that remote origin, so native
plugins are reachable without modifying the dashboard repo.

```
QSoftware-Dashboard-App/
  capacitor.config.ts      server.url -> https://app.qsoftware.ca
  www/                     bundled: boot screen, offline fallback, shell runtime
  src/shell/               TypeScript source for the injected native layer
  ios/ android/            generated native projects
  assets/                  logo + splash sources -> every platform size
  scripts/                 asset generation, environment doctor
```

Data flow:

```
[native shell]
   |  splash, status bar, push registration, deep links
   +-- WebView --> https://app.qsoftware.ca  (live SSR, unchanged)
   |                    ^
   |                    +-- Supabase cookies persist in the WebView cookie store
   +-- off-origin URL --> system browser (Stripe, Google OAuth)
   +-- offline --------> bundled www/offline.html
```

### Why the remote URL keeps auth working

Supabase SSR sets cookies scoped to `app.qsoftware.ca`. Because the WebView's origin *is*
`app.qsoftware.ca`, `middleware.ts` sees those cookies exactly as a desktop browser does.
WKWebView and Android WebView both persist cookies across launches, so sign-in survives app
restarts with no token bridging, no custom auth, and no change to the dashboard.

### Deployment coupling

A `vercel deploy` of the dashboard reaches every installed app immediately — no store review,
no version fragmentation. The tradeoff is the inverse: an outage or a breaking web deploy
takes the app down too. The bundled offline screen handles the former.

## Native layer

The native layer is what distinguishes this from a bookmark, and it is what Apple's
App Store Review Guideline 4.2 (Minimum Functionality) is measured against.

| Concern | Implementation | Rationale |
|---|---|---|
| Push notifications | `@capacitor/push-notifications`; registration and token handling in native code; tap deep-routes into the WebView | Primary native justification; missed-call alerts are the product's core value |
| Splash screen | Brand gradient (`#4f46e5` → `#7c3aed`), `@capacitor/splash-screen`, hidden on first paint | Remote-URL apps show white until the network returns; unacceptable cold start without it |
| Status bar | `@capacitor/status-bar`, follows light/dark | Matches dashboard theme |
| Safe areas | CSS injected into the remote page for notch and home indicator | The web app was not built for notched viewports |
| Android back button | Pops WebView history; exits only at the root | Default behaviour kills the app on first back press — a real defect, not a nicety |
| Deep links | Universal Links (iOS) + App Links (Android) on `app.qsoftware.ca/*` | Emailed booking/review links open the app |
| Off-origin links | `@capacitor/browser` (SFSafariViewController / Custom Tabs) | **Required**: Google blocks OAuth inside plain WebViews with `disallowed_useragent`; Stripe Checkout likewise wants a real browser |
| Offline | `@capacitor/network` listener swaps to `www/offline.html`, auto-retries on reconnect | Remote-URL apps otherwise show a WebKit error page |
| Haptics | `@capacitor/haptics` on navigation | Native feel |

### Isolation

Each shell concern is a separate module under `src/shell/` with one job and no knowledge of
the others — `push.ts`, `links.ts`, `back.ts`, `offline.ts`, `safe-area.ts`, each exporting a
single `install()`. `index.ts` composes them. A module can be removed by deleting one import.

## Credentials and gating

Push requires an APNs key (Apple Developer) and a Firebase project (`google-services.json`,
`GoogleService-Info.plist`). Those are not available in this session. The code is written and
wired; registration fails soft and logs a single warning when credentials are absent. The app
builds, installs, and runs fully without them. `SETUP.md` documents the exact steps to add
them later.

## Testing

- `npm run typecheck` — shell TypeScript compiles
- `npm run doctor` — verifies Node, Capacitor CLI, and reports whether Xcode/Android SDK are
  present, so a build failure is diagnosed before it happens
- `npx cap sync` — plugin and native project integrity
- Manual device verification (requires tooling not installed here): sign-in persistence across
  cold start, Android back navigation, offline swap, off-origin handoff

## Known limitations

- **Neither platform can be built in this session.** Xcode is absent (Command Line Tools only)
  and there is no Android SDK. Native projects are generated and synced; compiling and
  launching require the user to install tooling.
- The bundled `www/` is a boot and offline shell only. There is no offline access to dashboard
  data — that would require the full static rewrite this design rejects.
- App Store review of remote-URL apps is a real risk. The native layer above is the mitigation,
  not a guarantee.
