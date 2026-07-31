import { Capacitor } from '@capacitor/core'
import { PushNotifications, type Token } from '@capacitor/push-notifications'
import { log, warn } from './log'

/**
 * Push registration and tap routing.
 *
 * This is the reason the app exists rather than a bookmark: a missed call is
 * worth money to the owner and worth nothing if they find out tomorrow.
 *
 * FAILS SOFT BY DESIGN. Without an APNs key and a Firebase project the native
 * registration call rejects. That must not surface to the user or break the
 * dashboard — the app is fully usable without push, and SETUP.md documents
 * exactly how to turn it on. One warning, then silence.
 */

/**
 * Where the device token is handed to the backend.
 *
 * Implemented in the dashboard repo: app/api/user/push-token/route.ts, backed by
 * the push_tokens table in MIGRATION_v27.sql. POST registers, DELETE clears.
 */
const TOKEN_ENDPOINT = '/api/user/push-token'

/**
 * Which app this token belongs to. The dashboard and catch-app share one
 * push_tokens table, so a Catch-only alert does not have to wake both.
 */
const APP_NAME = 'dashboard'

export function installPush() {
  if (!Capacitor.isNativePlatform()) return

  PushNotifications.addListener('registration', (token: Token) => {
    log('push token acquired')
    void sendTokenToServer(token.value)
  })

  PushNotifications.addListener('registrationError', (err) => {
    warn('push registration failed — expected until APNs/FCM credentials are configured:', err)
  })

  // Foreground delivery. The OS does not draw a banner while the app is open, so
  // without this the notification is silently swallowed.
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    log('push received in foreground:', notification.title)
    window.dispatchEvent(new CustomEvent('q:push', { detail: notification }))
  })

  // The user tapped a notification. `data.path` is the contract: whatever sends
  // the push decides where it lands.
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const path = action.notification.data?.path
    if (typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')) {
      window.location.assign(path)
    }
  })

  void requestPermission()
}

async function requestPermission() {
  try {
    // Do not prompt again if the user already answered — iOS only shows the
    // system dialog once, and re-requesting a denied permission is a no-op that
    // hides the real state.
    let status = await PushNotifications.checkPermissions()
    if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
      status = await PushNotifications.requestPermissions()
    }
    if (status.receive !== 'granted') {
      log('push permission not granted:', status.receive)
      return
    }
    await PushNotifications.register()
  } catch (e) {
    warn('push unavailable:', e)
  }
}

async function sendTokenToServer(token: string) {
  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Same-origin, so the Supabase session cookie identifies the user and the
      // token is attributed to the right profile without extra auth.
      credentials: 'same-origin',
      body: JSON.stringify({
        token,
        platform: Capacitor.getPlatform(),
        app: APP_NAME,
        deviceName: deviceLabel(),
      }),
    })

    // 401 means the WebView has no session yet — the user is on the login page.
    // Not an error: registerAfterLogin() re-runs this once they are signed in.
    if (response.status === 401) {
      log('not signed in yet — will register after login')
      registerAfterLogin(token)
      return
    }
    if (!response.ok) {
      warn(`push token not stored (${response.status})`)
      return
    }
    log('push token registered with server')
  } catch (e) {
    warn('push token upload failed:', e)
  }
}

/**
 * Retry registration once the user signs in.
 *
 * Registration fires at launch, which on a fresh install is the login screen —
 * so the first POST is guaranteed to 401 for exactly the users who most need
 * notifications. Watching for the URL leaving /login is enough here: signing in
 * always navigates, and the dashboard is server-rendered so that is a real
 * navigation, not a silent state change.
 */
function registerAfterLogin(token: string) {
  let lastPath = window.location.pathname

  const check = () => {
    const path = window.location.pathname
    if (path === lastPath) return
    lastPath = path
    if (!path.startsWith('/login') && !path.startsWith('/get-started')) {
      clearInterval(timer)
      void sendTokenToServer(token)
    }
  }

  const timer = setInterval(check, 1000)
  // Give up after five minutes rather than polling for the life of the app.
  setTimeout(() => clearInterval(timer), 5 * 60 * 1000)
}

/**
 * Best-effort device label, so an owner can tell their devices apart if the
 * dashboard ever lists them. Purely cosmetic — the server truncates it.
 */
function deviceLabel(): string {
  const platform = Capacitor.getPlatform()
  const ua = navigator.userAgent
  const model = /\((?:iPhone|iPad|Linux; Android [\d.]+; ([^)]+))/.exec(ua)?.[1]
  return model ? `${model}` : platform === 'ios' ? 'iPhone' : 'Android device'
}
