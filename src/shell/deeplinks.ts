import { App, type URLOpenListenerEvent } from '@capacitor/app'
import { log } from './log'

const APP_HOST = 'app.qsoftware.ca'

/**
 * Universal Links (iOS) and App Links (Android).
 *
 * The dashboard emails links constantly — review requests, booking confirmations,
 * password resets. Once the domain association files are served (SETUP.md step 5)
 * the OS hands those URLs to the app instead of the browser, and this routes them
 * to the right page without a full reload.
 */
export function installDeepLinks() {
  App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
    let url: URL
    try {
      url = new URL(event.url)
    } catch {
      return
    }
    if (url.hostname !== APP_HOST) return

    const destination = url.pathname + url.search + url.hash
    log('deep link:', destination)

    // Already there — reload rather than push a duplicate history entry.
    if (destination === window.location.pathname + window.location.search) {
      window.location.reload()
      return
    }
    window.location.assign(destination)
  })

  // Returning from the system browser (Stripe Checkout, Google OAuth) — the
  // session or subscription state may have changed while the app was backgrounded.
  App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) return
    const path = window.location.pathname
    if (path.startsWith('/dashboard/billing') || path.startsWith('/login')) {
      window.location.reload()
    }
  })

  log('deeplinks installed')
}
