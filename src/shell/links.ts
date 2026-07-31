import { Browser } from '@capacitor/browser'
import { log } from './log'

const APP_HOST = 'app.qsoftware.ca'

/**
 * Hosts that MUST leave the WebView.
 *
 * This is not a polish item. Google refuses OAuth inside an embedded WebView and
 * returns `disallowed_useragent` — sign-in with Google is simply broken unless the
 * handoff happens. Stripe Checkout and the Square OAuth flow have the same
 * requirement in practice: they need a real browser for 3-D Secure and for the
 * password manager the user actually stores their card in.
 */
const FORCE_EXTERNAL = [
  'accounts.google.com',
  'checkout.stripe.com',
  'connect.stripe.com',
  'billing.stripe.com',
  'squareup.com',
  'connect.squareup.com',
  'squareupsandbox.com',
]

function isInternal(url: URL): boolean {
  if (FORCE_EXTERNAL.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))) {
    return false
  }
  return url.hostname === APP_HOST
}

/**
 * Opens off-origin destinations in the system browser (SFSafariViewController on
 * iOS, Custom Tabs on Android) instead of navigating the app's WebView there.
 *
 * Capture-phase click interception rather than link rewriting: the dashboard is
 * a React app that re-renders constantly, so any DOM mutation approach would
 * need re-running on every render and would still lose races.
 */
export function installLinks() {
  document.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const anchor = (event.target as HTMLElement | null)?.closest?.('a')
      if (!anchor) return

      const href = anchor.getAttribute('href')
      if (!href) return

      // Let the OS handle the schemes it owns. `tel:` in particular matters here —
      // this is a missed-call product and owners call customers back from it.
      if (/^(tel|mailto|sms|geo|maps):/i.test(href)) return

      let url: URL
      try {
        url = new URL(href, window.location.href)
      } catch {
        return
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return
      if (isInternal(url)) return

      event.preventDefault()
      event.stopPropagation()
      Browser.open({ url: url.href, presentationStyle: 'popover' }).catch(() => {
        // If the in-app browser refuses, a normal navigation still beats a
        // dead link — the shell's job is never to swallow the user's intent.
        window.location.href = url.href
      })
    },
    true,
  )

  // window.open() bypasses the click handler entirely; the dashboard uses it for
  // Stripe's portal redirect among others.
  const nativeOpen = window.open.bind(window)
  window.open = function patchedOpen(
    target?: string | URL,
    ...rest: unknown[]
  ): Window | null {
    if (target) {
      try {
        const url = new URL(String(target), window.location.href)
        if (/^https?:$/.test(url.protocol) && !isInternal(url)) {
          Browser.open({ url: url.href }).catch(() => {})
          return null
        }
      } catch {
        /* fall through to the real window.open */
      }
    }
    return nativeOpen(target as string, ...(rest as [string?, string?]))
  } as typeof window.open

  log('links installed')
}
