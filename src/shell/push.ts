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
 * The dashboard does not expose this endpoint yet — see SETUP.md, step 4. Until
 * it does, a 404 here is expected and logged once at warn level rather than
 * retried, because retrying a route that does not exist is just noise.
 */
const TOKEN_ENDPOINT = '/api/user/push-token'

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
      // token is attributed to the right business without extra auth.
      credentials: 'same-origin',
      body: JSON.stringify({ token, platform: Capacitor.getPlatform() }),
    })
    if (!response.ok) {
      warn(`push token not stored (${response.status}) — see SETUP.md step 4`)
      return
    }
    log('push token registered with server')
  } catch (e) {
    warn('push token upload failed:', e)
  }
}
