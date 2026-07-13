/**
 * Som curto de notificação (Web Audio API — sem arquivo externo).
 * Respeita preferência local e política de autoplay (precisa de gesto prévio).
 */

const PREF_KEY = 'cp_notif_sound'

export function isNotificationSoundEnabled() {
  if (typeof window === 'undefined') return false
  try {
    const v = localStorage.getItem(PREF_KEY)
    if (v === '0') return false
    return true
  } catch {
    return true
  }
}

export function setNotificationSoundEnabled(enabled) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(PREF_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

let audioCtx = null
let unlocked = false

export function unlockNotificationAudio() {
  if (typeof window === 'undefined') return
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    if (!audioCtx) audioCtx = new Ctx()
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {})
    }
    unlocked = true
  } catch {
    /* ignore */
  }
}

export function playNotificationSound({ kind = 'default' } = {}) {
  if (typeof window === 'undefined') return
  if (!isNotificationSoundEnabled()) return

  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    if (!audioCtx) audioCtx = new Ctx()
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {})
    }

    const now = audioCtx.currentTime
    const gain = audioCtx.createGain()
    gain.connect(audioCtx.destination)

    const freqs =
      kind === 'success'
        ? [523.25, 659.25, 783.99]
        : kind === 'motivation'
          ? [392, 523.25]
          : [880, 1174.66]

    freqs.forEach((freq, i) => {
      const osc = audioCtx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      const g = audioCtx.createGain()
      const t0 = now + i * 0.09
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18)
      osc.connect(g)
      g.connect(gain)
      osc.start(t0)
      osc.stop(t0 + 0.2)
    })
    unlocked = true
  } catch {
    /* ignore autoplay block */
  }
}

/** Dispara som só quando a contagem de não lidas sobe (ignora 1ª carga). */
export function createUnreadSoundWatcher({ kind = 'default' } = {}) {
  let primed = false
  let last = 0
  return (unreadCount) => {
    const n = Number(unreadCount) || 0
    if (!primed) {
      primed = true
      last = n
      return
    }
    if (n > last) {
      playNotificationSound({ kind })
    }
    last = n
  }
}

export { unlocked as notificationAudioUnlocked }
