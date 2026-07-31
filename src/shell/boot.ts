import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { log } from './log'

const BRAND = '#4f46e5'
const CANVAS_DARK = '#08090f'

/**
 * Hides the splash on first paint rather than on a timer.
 *
 * capacitor.config.ts sets launchAutoHide: false deliberately. A remote-URL app
 * cannot know how long the first load takes — it depends on the network — so any
 * fixed duration is wrong in both directions: too short flashes white, too long
 * stalls an app that was ready.
 */
export function installBoot() {
  const reveal = () => {
    SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {})
  }

  if (document.readyState === 'complete') {
    reveal()
  } else {
    window.addEventListener('load', reveal, { once: true })
    // Backstop: if `load` never fires (a stalled subresource on a page that is
    // otherwise interactive), the user must not be left staring at the splash.
    setTimeout(reveal, 5000)
  }

  installStatusBar()
  log('boot installed', Capacitor.getPlatform())
}

/**
 * The dashboard themes itself from `prefers-color-scheme`; the native status bar
 * has to follow or the top strip reads as a different app.
 */
function installStatusBar() {
  const media = window.matchMedia('(prefers-color-scheme: dark)')

  const apply = (dark: boolean) => {
    // Style names the CONTENT it is meant for, not the text colour: Style.Dark is
    // "light text for dark backgrounds". So dark theme -> Style.Dark. Reading it
    // as a text colour inverts the mapping and hides the icons on both themes.
    StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {})
    if (Capacitor.getPlatform() === 'android') {
      StatusBar.setBackgroundColor({ color: dark ? CANVAS_DARK : BRAND }).catch(() => {})
    }
  }

  apply(media.matches)
  media.addEventListener('change', (e) => apply(e.matches))
}
