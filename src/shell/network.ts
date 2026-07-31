import { Network } from '@capacitor/network'
import { log } from './log'

/**
 * Mid-session connectivity loss.
 *
 * The cold-start case — no network when the app launches — cannot be handled
 * here, because a page that never loaded cannot run this script. That one is
 * handled natively (ios/App/App/ShellViewController.swift and
 * android/.../MainActivity.java swap to the bundled offline.html).
 *
 * What this covers is the other case: the dashboard is open, the owner walks
 * into a walk-in freezer, and every subsequent fetch fails silently. A banner is
 * the right weight — replacing the page would throw away state they can still read.
 */
const BANNER_ID = 'q-shell-offline'

export function installNetwork() {
  Network.addListener('networkStatusChange', (status) => {
    if (status.connected) {
      hideBanner()
      // Data on screen is now stale by however long the outage lasted. Reloading
      // is the honest move, but only from a state where nothing is half-typed.
      if (!hasUnsavedInput()) {
        window.location.reload()
      }
    } else {
      showBanner()
    }
  })

  void Network.getStatus().then((status) => {
    if (!status.connected) showBanner()
  })

  log('network installed')
}

/**
 * Never reload out from under a half-written reply. The dashboard's whole job is
 * composing customer messages; losing one to a helpful refresh is worse than
 * showing stale numbers.
 */
function hasUnsavedInput(): boolean {
  const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea',
  )
  for (const field of Array.from(fields)) {
    if (field.value && field.value !== field.defaultValue) return true
  }
  return document.querySelector('[contenteditable="true"]:not(:empty)') !== null
}

function showBanner() {
  if (document.getElementById(BANNER_ID)) return

  const el = document.createElement('div')
  el.id = BANNER_ID
  el.setAttribute('role', 'status')
  el.textContent = 'No connection — showing the last loaded data'
  el.style.cssText = [
    'position:fixed',
    'left:0',
    'right:0',
    'top:0',
    'padding:calc(10px + env(safe-area-inset-top, 0px)) 16px 10px',
    'background:#b45309',
    'color:#fff',
    'font:600 13px/1.4 system-ui,sans-serif',
    'text-align:center',
    'z-index:2147483646',
  ].join(';')
  document.body.appendChild(el)
}

function hideBanner() {
  document.getElementById(BANNER_ID)?.remove()
}
