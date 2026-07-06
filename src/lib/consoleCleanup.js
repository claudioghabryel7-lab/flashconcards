import { isDevEnv } from './env.js'

let applied = false

export function cleanupConsole() {
  if (applied || typeof window === 'undefined') return
  applied = true

  if (isDevEnv()) return

  const noop = () => {}
  const methods = ['log', 'info', 'debug', 'warn', 'error', 'trace']
  methods.forEach((method) => {
    try {
      console[method] = noop
    } catch {
      // ignora ambientes restritos
    }
  })
}
