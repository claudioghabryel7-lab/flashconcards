/**
 * Controles em memória para pause / resume / cancel de jobs locais.
 * Checkpoint no Firestore permite retomar após reload; pause vivo só na aba atual.
 */

export class JobCancelledError extends Error {
  constructor(message = 'Geração cancelada.') {
    super(message)
    this.name = 'JobCancelledError'
    this.code = 'job_cancelled'
  }
}

export class JobPausedExitError extends Error {
  constructor(message = 'Geração pausada.') {
    super(message)
    this.name = 'JobPausedExitError'
    this.code = 'job_paused'
  }
}

/** @type {Map<string, { paused: boolean, cancelled: boolean, waiters: Array<() => void> }>} */
const controls = new Map()

function ensure(jobId) {
  if (!jobId) return null
  let c = controls.get(jobId)
  if (!c) {
    c = { paused: false, cancelled: false, waiters: [] }
    controls.set(jobId, c)
  }
  return c
}

function wake(jobId) {
  const c = controls.get(jobId)
  if (!c) return
  const waiters = c.waiters.splice(0, c.waiters.length)
  waiters.forEach((fn) => {
    try {
      fn()
    } catch {
      /* ignore */
    }
  })
}

export function registerJobControl(jobId) {
  return ensure(jobId)
}

export function clearJobControl(jobId) {
  if (!jobId) return
  wake(jobId)
  controls.delete(jobId)
}

export function isJobPausedLocal(jobId) {
  return Boolean(controls.get(jobId)?.paused)
}

export function isJobCancelledLocal(jobId) {
  return Boolean(controls.get(jobId)?.cancelled)
}

export function hasLocalJobControl(jobId) {
  return controls.has(jobId)
}

export function requestJobPause(jobId) {
  const c = ensure(jobId)
  if (!c) return false
  c.paused = true
  return true
}

export function requestJobResume(jobId) {
  const c = ensure(jobId)
  if (!c) return false
  c.paused = false
  c.cancelled = false
  wake(jobId)
  return true
}

export function requestJobCancel(jobId) {
  const c = ensure(jobId)
  if (!c) return false
  c.cancelled = true
  c.paused = false
  wake(jobId)
  return true
}

/**
 * Aguarda se pausado; lança se cancelado.
 * Chamar entre lotes / antes de cada chamada à API.
 */
export async function waitForJobControl(jobId) {
  if (!jobId) return

  for (;;) {
    const c = controls.get(jobId) || ensure(jobId)
    if (!c) return
    if (c.cancelled) {
      throw new JobCancelledError()
    }
    if (!c.paused) return

    await new Promise((resolve) => {
      c.waiters.push(resolve)
    })
  }
}

/** Atalho: checa cancel sem esperar pause. */
export function throwIfJobCancelled(jobId) {
  if (jobId && controls.get(jobId)?.cancelled) {
    throw new JobCancelledError()
  }
}
