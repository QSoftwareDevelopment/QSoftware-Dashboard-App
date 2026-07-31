import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { log } from './log'

/**
 * A light tap on the controls that commit something. Deliberately narrow: haptics
 * on every tap stops meaning anything, and the dashboard's own guidance is to
 * respect reduced-motion preferences.
 */
export function installHaptics() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    log('haptics skipped (reduced motion)')
    return
  }

  document.addEventListener(
    'pointerdown',
    (event) => {
      const target = (event.target as HTMLElement | null)?.closest?.(
        'button, a[href], [role="button"], [role="tab"], [role="switch"]',
      )
      if (!target) return
      if (target.hasAttribute('disabled') || target.getAttribute('aria-disabled') === 'true') return

      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
    },
    { passive: true, capture: true },
  )

  log('haptics installed')
}
