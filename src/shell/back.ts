import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { log } from './log'

/**
 * Android's hardware/gesture back button.
 *
 * Capacitor's default is to exit the app on any back press. In a multi-page
 * dashboard that is a defect, not a preference: an owner three levels into a
 * conversation thread presses back expecting the list and the app closes.
 *
 * Order of precedence, most specific first:
 *   1. An open modal/drawer — dismiss it, stay on the page.
 *   2. History — go back one entry.
 *   3. At the root — require a second press within 2s before exiting, so the
 *      exit is always deliberate.
 */
const ROOT_PATHS = ['/', '/dashboard', '/login', '/admin', '/admin/accounts']
const DOUBLE_TAP_MS = 2000

export function installBack() {
  if (Capacitor.getPlatform() !== 'android') return

  let lastPress = 0

  App.addListener('backButton', ({ canGoBack }) => {
    if (dismissTopOverlay()) return

    const atRoot = ROOT_PATHS.includes(window.location.pathname)

    if (canGoBack && !atRoot && window.history.length > 1) {
      window.history.back()
      return
    }

    // Date.now() is fine here — this is device-local UI timing, and the value is
    // only ever compared against itself.
    const now = Date.now()
    if (now - lastPress < DOUBLE_TAP_MS) {
      App.exitApp()
      return
    }
    lastPress = now
    toast('Press back again to exit')
  })

  log('back installed')
}

/**
 * Closes whatever the dashboard has open on top of the page. Radix and most
 * headless UI libraries respond to Escape, so that is tried first and covers the
 * common case without the shell needing to know the component library.
 */
function dismissTopOverlay(): boolean {
  const overlay = document.querySelector<HTMLElement>(
    '[role="dialog"][data-state="open"], [data-overlay][data-open], dialog[open]',
  )
  if (!overlay) return false

  const closeButton = overlay.querySelector<HTMLElement>(
    '[data-dismiss], [aria-label="Close"], [aria-label="close"]',
  )
  if (closeButton) {
    closeButton.click()
  } else {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }),
    )
  }
  return true
}

function toast(message: string) {
  const existing = document.getElementById('q-shell-toast')
  if (existing) existing.remove()

  const el = document.createElement('div')
  el.id = 'q-shell-toast'
  el.textContent = message
  el.style.cssText = [
    'position:fixed',
    'left:50%',
    'bottom:calc(32px + env(safe-area-inset-bottom, 0px))',
    'transform:translateX(-50%)',
    'background:rgba(8,9,15,.92)',
    'color:#fff',
    'font:500 14px/1 system-ui,sans-serif',
    'padding:12px 18px',
    'border-radius:999px',
    'z-index:2147483647',
    'pointer-events:none',
  ].join(';')
  document.body.appendChild(el)
  setTimeout(() => el.remove(), DOUBLE_TAP_MS)
}
