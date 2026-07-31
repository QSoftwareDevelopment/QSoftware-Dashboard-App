import { log } from './log'

/**
 * Small native-feel touches the dashboard does not already handle.
 *
 * Deliberately tiny. An earlier version of this module injected safe-area padding
 * for notches and home indicators — that was wrong on two counts:
 *
 *   1. The dashboard ALREADY does it, and does it properly:
 *        globals.css      .dashboard-main padding-bottom: calc(64px + env(safe-area-inset-bottom))
 *        globals.css      .mobile-bottom-nav padding-left/right: env(safe-area-inset-*)
 *        MobilePageHeader padding-top: calc(12px + env(safe-area-inset-top))
 *        Sidebar          env(safe-area-inset-top) and -bottom
 *      It even forces `font-size: 16px` on form controls to stop iOS zooming the
 *      viewport on focus. This is a mobile-aware layout, not a desktop one.
 *
 *   2. The selectors were guesses (`.app-tabbar`, `[data-app-header]`) that match
 *      nothing in the dashboard. Where one DID match — `[role="dialog"]` — it would
 *      have stacked padding on top of the dashboard's own, pushing modals off-screen.
 *
 * The rule this leaves behind: the shell adds what is missing and never re-does
 * what the web app already owns. Check globals.css before adding anything here.
 */
const CSS = `
  /* Rubber-band scrolling past the top and bottom is the clearest tell that a
     native screen is really a web page. The dashboard does not set this. */
  html, body {
    overscroll-behavior-y: none;
  }
`

export function installNativeFeel() {
  const style = document.createElement('style')
  style.id = 'q-shell-native-feel'
  style.textContent = CSS
  document.head.appendChild(style)

  // Lets the dashboard target the native app specifically (`html.q-native { … }`)
  // without having to detect Capacitor itself.
  document.documentElement.classList.add('q-native')

  log('native-feel installed')
}
