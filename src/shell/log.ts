/**
 * The shell runs inside the dashboard's page, so anything it logs lands in the
 * same console the web team reads. Prefixing keeps the two separable.
 */
const PREFIX = '[q-shell]'

export const log = (...args: unknown[]) => console.log(PREFIX, ...args)
export const warn = (...args: unknown[]) => console.warn(PREFIX, ...args)
export const error = (...args: unknown[]) => console.error(PREFIX, ...args)

/**
 * Every install() is wrapped in this. One failing shell module — a plugin
 * missing because credentials were never added, say — must not take down the
 * rest of the shell or, worse, the dashboard itself.
 */
export function guard(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn()
    if (result instanceof Promise) {
      result.catch((e) => warn(`${name} failed:`, e))
    }
  } catch (e) {
    warn(`${name} failed:`, e)
  }
}
