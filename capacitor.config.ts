import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The dashboard is a server-rendered Next.js app: middleware.ts performs the
 * Supabase cookie auth and 98 route handlers under app/api/** do the real work.
 * None of that survives `output: 'export'`, so there is no static bundle to
 * ship — the WebView loads the live deployment instead.
 *
 * Because the WebView's origin IS app.qsoftware.ca, Supabase's SSR cookies are
 * first-party and middleware.ts sees a signed-in user exactly as a desktop
 * browser would. Sign-in survives cold starts with no token bridging.
 *
 * `webDir` still points at www/ — Capacitor requires it, and the bundled files
 * are the boot screen and the offline fallback we swap to when the network dies.
 */

const APP_ORIGIN = 'https://app.qsoftware.ca'

const config: CapacitorConfig = {
  appId: 'ca.qsoftware.dashboard',
  appName: 'Q Software',
  webDir: 'www',

  server: {
    url: APP_ORIGIN,
    // Never allow plaintext. A remote-URL app that silently downgrades to http
    // would put session cookies on the wire.
    cleartext: false,
    androidScheme: 'https',
    // Anything not on this list is opened in the system browser by
    // src/shell/links.ts rather than navigated to inside the WebView.
    allowNavigation: ['app.qsoftware.ca'],
    // Cold-start offline: if the remote origin cannot be reached there is no page
    // for the shell to run in, so Capacitor loads this bundled file instead.
    // Both platforms gate this on the MAIN FRAME failing — a subresource 404 does
    // not trigger it, which is why this is used rather than a WebViewListener.
    errorPath: 'offline.html',
  },

  ios: {
    // Required for server.url to load at all: with app-bound domains enabled,
    // WKWebView refuses navigation to any origin not declared in
    // WKAppBoundDomains. We manage the origin allowlist ourselves above.
    limitsNavigationsToAppBoundDomains: false,
    contentInset: 'always',
    backgroundColor: '#f1f3f9',
    // The dashboard handles its own pull-to-refresh; the native bounce on top
    // of it reads as a broken scroll container.
    scrollEnabled: true,
  },

  android: {
    backgroundColor: '#f1f3f9',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },

  plugins: {
    SplashScreen: {
      // We hide it from JS on first paint (src/shell/boot.ts) instead of on a
      // timer — a remote-URL app's first paint depends on the network, so any
      // fixed duration is either a stall or a white flash.
      launchAutoHide: false,
      launchShowDuration: 0,
      backgroundColor: '#4f46e5',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    StatusBar: {
      overlaysWebView: false,
      style: 'DEFAULT',
      backgroundColor: '#4f46e5',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
  },
}

export default config
