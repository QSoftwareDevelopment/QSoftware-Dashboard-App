import { log } from './log'

/**
 * The dashboard was built for browser viewports, which have no notch and no home
 * indicator. Rather than edit the web app, the shell injects padding driven by
 * the platform's own safe-area insets.
 *
 * Sticky headers and bottom bars are the two things that actually break, so those
 * are targeted specifically instead of padding <body> — padding the body would
 * detach `position: fixed` elements from the screen edges and look worse.
 */
const CSS = `
  :root {
    --q-safe-top: env(safe-area-inset-top, 0px);
    --q-safe-bottom: env(safe-area-inset-bottom, 0px);
    --q-safe-left: env(safe-area-inset-left, 0px);
    --q-safe-right: env(safe-area-inset-right, 0px);
  }

  /* Native app, not a web page: kill the affordances that give the WebView away. */
  html {
    -webkit-text-size-adjust: 100%;
    overscroll-behavior-y: none;
  }
  body {
    -webkit-tap-highlight-color: transparent;
    overscroll-behavior-y: none;
  }

  /* Text selection reads as a bug on a native surface — except where the user is
     actually meant to select: inputs, and the transcript/message content the
     dashboard exists to let owners copy out. */
  body {
    -webkit-user-select: none;
    user-select: none;
  }
  input, textarea, [contenteditable="true"],
  [data-selectable], pre, code {
    -webkit-user-select: text;
    user-select: text;
  }

  /* Fixed chrome must clear the notch and the home indicator. */
  header[class*="fixed"], header[class*="sticky"],
  [data-app-header], .app-header {
    padding-top: var(--q-safe-top);
  }
  nav[class*="fixed"][class*="bottom"],
  [data-app-tabbar], .app-tabbar {
    padding-bottom: var(--q-safe-bottom);
  }

  /* Modals and drawers rendered to the document root. */
  [role="dialog"], [data-overlay] {
    padding-top: var(--q-safe-top);
    padding-bottom: var(--q-safe-bottom);
  }
`

export function installSafeArea() {
  const style = document.createElement('style')
  style.id = 'q-shell-safe-area'
  style.textContent = CSS
  document.head.appendChild(style)

  // Marks the document so the dashboard can opt into native-only styling later
  // (`html.q-native { … }`) without needing to detect Capacitor itself.
  document.documentElement.classList.add('q-native')
  log('safe-area installed')
}
