import { Capacitor } from '@capacitor/core'
import { installBack } from './back'
import { installBoot } from './boot'
import { installDeepLinks } from './deeplinks'
import { installHaptics } from './haptics'
import { installLinks } from './links'
import { installNetwork } from './network'
import { installPush } from './push'
import { installSafeArea } from './safe-area'
import { guard, log } from './log'

/**
 * The native shell, injected into the dashboard page by native code
 * (ShellViewController.swift / MainActivity.java) on every page load.
 *
 * It is injected rather than imported because the page it runs in is served by
 * Vercel from a different repository — this project never modifies the dashboard.
 *
 * Each module is independent and guarded: one failure never cascades. Removing a
 * capability means deleting one line here.
 */
declare global {
  interface Window {
    __qShellInstalled?: boolean
  }
}

function install() {
  // Injection fires per page load, and a client-side route change can fire it
  // again; listeners must not stack up.
  if (window.__qShellInstalled) return
  window.__qShellInstalled = true

  if (!Capacitor.isNativePlatform()) {
    log('not a native platform — shell inert')
    return
  }

  guard('boot', installBoot)
  guard('safe-area', installSafeArea)
  guard('links', installLinks)
  guard('back', installBack)
  guard('deeplinks', installDeepLinks)
  guard('network', installNetwork)
  guard('haptics', installHaptics)
  guard('push', installPush)

  log('ready on', Capacitor.getPlatform())
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install, { once: true })
} else {
  install()
}
