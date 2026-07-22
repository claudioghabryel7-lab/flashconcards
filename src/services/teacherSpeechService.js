/**
 * Motor de fala do Modo Professor — 100% local (Web Speech API).
 * Sem API de IA: usa vozes do navegador/SO, priorizando Neural/Natural.
 */

const STORAGE_KEY = 'flashconcards.smartTeacher.v1'

export const THINK_TIME_OPTIONS = [
  { value: 5, label: '5 segundos' },
  { value: 10, label: '10 segundos' },
  { value: 15, label: '15 segundos' },
  { value: 20, label: '20 segundos' },
  { value: 30, label: '30 segundos' },
  { value: 45, label: '45 segundos' },
  { value: 60, label: '1 minuto' },
]

export const DEFAULT_TEACHER_SETTINGS = {
  gender: 'female', // 'female' | 'male'
  thinkSeconds: 15,
  speechRate: 0.92,
  autoAdvance: true,
}

const FEMALE_HINTS = [
  'female', 'woman', 'feminina', 'mulher',
  'francisca', 'maria', 'luciana', 'helena', 'gabriela', 'vitória', 'vitoria',
  'fernanda', 'camila', 'ana', 'julia', 'júlia', 'beatriz', 'isabela',
  'daniela', 'patricia', 'patrícia', 'sara', 'sofia', 'joana', 'ines', 'ines',
  'amalia', 'amália', 'raquel', 'catarina', 'lucia', 'lúcia',
]

const MALE_HINTS = [
  'male', 'man', 'masculina', 'homem',
  'antonio', 'antónio', 'daniel', 'felipe', 'ricardo', 'thiago', 'tiago',
  'joao', 'joão', 'pedro', 'carlos', 'paulo', 'lucas', 'bruno', 'rafael',
  'gustavo', 'marcelo', 'rodrigo', 'andre', 'andré', 'faber', 'jeff', 'cadu',
  'edresson', 'heitor', 'nicolas', 'nicolás',
]

const PREMIUM_HINTS = [
  'natural', 'neural', 'premium', 'enhanced', 'online', 'wavenet',
  'studio', 'journey', 'polyglot', 'expressive',
]

function loadRawSettings() {
  if (typeof window === 'undefined') return { ...DEFAULT_TEACHER_SETTINGS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_TEACHER_SETTINGS }
    return { ...DEFAULT_TEACHER_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_TEACHER_SETTINGS }
  }
}

export function getTeacherSettings() {
  return loadRawSettings()
}

export function saveTeacherSettings(partial) {
  const next = { ...loadRawSettings(), ...partial }
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
  return next
}

export function isSpeechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function waitForVoices(timeoutMs = 2500) {
  if (!isSpeechSupported()) return Promise.resolve([])

  const existing = window.speechSynthesis.getVoices()
  if (existing.length) return Promise.resolve(existing)

  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      window.speechSynthesis.onvoiceschanged = null
      resolve(window.speechSynthesis.getVoices() || [])
    }
    window.speechSynthesis.onvoiceschanged = finish
    setTimeout(finish, timeoutMs)
  })
}

function normalizeVoiceName(voice) {
  return `${voice?.name || ''} ${voice?.voiceURI || ''}`.toLowerCase()
}

function langScore(voice) {
  const lang = (voice.lang || '').toLowerCase().replace('_', '-')
  if (lang === 'pt-br' || lang.startsWith('pt-br')) return 100
  if (lang.startsWith('pt')) return 70
  return 0
}

function premiumScore(voice) {
  const name = normalizeVoiceName(voice)
  let score = 0
  for (const hint of PREMIUM_HINTS) {
    if (name.includes(hint)) score += 25
  }
  if (voice.localService === false) score += 8 // vozes "online" do Edge costumam soar mais naturais
  if (voice.default) score += 2
  return score
}

function genderScore(voice, gender) {
  const name = normalizeVoiceName(voice)
  const femaleHits = FEMALE_HINTS.filter((h) => name.includes(h)).length
  const maleHits = MALE_HINTS.filter((h) => name.includes(h)).length

  if (gender === 'female') {
    if (femaleHits > 0) return 40 + femaleHits * 8
    if (maleHits > 0) return -40
    // Empate: preferir pitch mais alto via nomes neutros — leve bônus se não for claramente masculina
    return 0
  }

  if (maleHits > 0) return 40 + maleHits * 8
  if (femaleHits > 0) return -40
  return 0
}

export function scoreVoiceForTeacher(voice, gender = 'female') {
  if (!voice) return -Infinity
  const lang = langScore(voice)
  if (lang <= 0) return -1000
  return lang + premiumScore(voice) + genderScore(voice, gender)
}

export function pickTeacherVoice(voices, gender = 'female') {
  const list = Array.isArray(voices) ? voices : []
  if (!list.length) return null

  const ranked = [...list]
    .map((voice) => ({ voice, score: scoreVoiceForTeacher(voice, gender) }))
    .filter((entry) => entry.score > -500)
    .sort((a, b) => b.score - a.score)

  if (ranked.length) return ranked[0].voice

  // Fallback: qualquer pt*
  const pt = list.find((v) => (v.lang || '').toLowerCase().startsWith('pt'))
  return pt || list[0] || null
}

export function listTeacherVoices(voices, gender) {
  const list = Array.isArray(voices) ? voices : []
  return [...list]
    .map((voice) => ({ voice, score: scoreVoiceForTeacher(voice, gender) }))
    .filter((entry) => entry.score > -500)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.voice)
}

/** Normaliza texto de estudo para leitura mais natural (concursos). */
export function prepareSpeechText(raw = '') {
  let text = String(raw || '')
    .replace(/<br\s*\/?>/gi, '. ')
    .replace(/<\/p>/gi, '. ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, 'e')
    .replace(/&lt;/g, ' ')
    .replace(/&gt;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!text) return ''

  // Abreviações comuns em materiais de concurso
  const replacements = [
    [/\bArt\.\s*/gi, 'Artigo '],
    [/\barts\.\s*/gi, 'artigos '],
    [/\bInc\.\s*/gi, 'Inciso '],
    [/\bPar\.\s*único\b/gi, 'Parágrafo único'],
    [/\b§\s*/g, 'parágrafo '],
    [/\bCF\/?\s*88\b/gi, 'Constituição Federal de mil novecentos e oitenta e oito'],
    [/\bCF\b/g, 'Constituição Federal'],
    [/\bSTF\b/g, 'S T F'],
    [/\bSTJ\b/g, 'S T J'],
    [/\bCNJ\b/g, 'C N J'],
    [/\bMP\b/g, 'Ministério Público'],
    [/\bN\.?\s*º\b/gi, 'número '],
    [/\bnº\b/gi, 'número '],
    [/(\d+)\s*%/g, '$1 por cento'],
  ]

  for (const [re, to] of replacements) {
    text = text.replace(re, to)
  }

  return text.replace(/\s+/g, ' ').trim()
}

function splitIntoChunks(text) {
  const prepared = prepareSpeechText(text)
  if (!prepared) return []

  // Frases com pausa natural; evita pedaços minúsculos
  const parts = prepared
    .split(/(?<=[.!?…;:])\s+|\n+/)
    .map((p) => p.trim())
    .filter(Boolean)

  const chunks = []
  let buffer = ''
  for (const part of parts) {
    if ((buffer + ' ' + part).trim().length < 180) {
      buffer = `${buffer} ${part}`.trim()
    } else {
      if (buffer) chunks.push(buffer)
      buffer = part
    }
  }
  if (buffer) chunks.push(buffer)
  return chunks.length ? chunks : [prepared]
}

function createAudioContext() {
  if (typeof window === 'undefined') return null
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  return new Ctx()
}

let sharedAudioCtx = null
const audioBuffers = new Map()

async function getAudioContext() {
  if (!sharedAudioCtx) sharedAudioCtx = createAudioContext()
  if (sharedAudioCtx?.state === 'suspended') {
    try {
      await sharedAudioCtx.resume()
    } catch {
      /* ignore */
    }
  }
  return sharedAudioCtx
}

async function loadSoundBuffer(url) {
  if (audioBuffers.has(url)) return audioBuffers.get(url)
  const ctx = await getAudioContext()
  if (!ctx) return null
  try {
    const res = await fetch(url)
    const arr = await res.arrayBuffer()
    const buffer = await ctx.decodeAudioData(arr.slice(0))
    audioBuffers.set(url, buffer)
    return buffer
  } catch {
    return null
  }
}

async function playBuffer(buffer, { volume = 0.45 } = {}) {
  const ctx = await getAudioContext()
  if (!ctx || !buffer) return
  const src = ctx.createBufferSource()
  const gain = ctx.createGain()
  gain.gain.value = volume
  src.buffer = buffer
  src.connect(gain)
  gain.connect(ctx.destination)
  src.start(0)
}

/** Tick sintético (fallback se o WAV não carregar). */
async function playSyntheticTick({ final = false } = {}) {
  const ctx = await getAudioContext()
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = final ? 620 : 900
  const now = ctx.currentTime
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(final ? 0.28 : 0.18, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (final ? 0.14 : 0.07))
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + (final ? 0.16 : 0.09))
}

export async function playTickSound({ final = false } = {}) {
  const url = final ? '/sounds/tick-final.wav' : '/sounds/tick.wav'
  const buffer = await loadSoundBuffer(url)
  if (buffer) {
    await playBuffer(buffer, { volume: final ? 0.5 : 0.38 })
    return
  }
  await playSyntheticTick({ final })
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Contagem regressiva com ticks (um por segundo; tick final no fim).
 * `shouldPause` (opcional) — enquanto retornar true, a contagem fica em espera.
 */
export async function runThinkCountdown(seconds, { signal, onTick, shouldPause } = {}) {
  const total = Math.max(0, Number(seconds) || 0)
  for (let remaining = total; remaining > 0; remaining -= 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    while (typeof shouldPause === 'function' && shouldPause()) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      await delay(120, signal)
    }
    onTick?.(remaining)
    await playTickSound({ final: remaining === 1 })
    await delay(1000, signal)
  }
  onTick?.(0)
}

/**
 * Lê texto com pausas naturais. Retorna Promise que resolve ao terminar.
 */
export function speakText(text, options = {}) {
  const {
    voice = null,
    gender = 'female',
    rate = 0.92,
    pitch,
    volume = 1,
    signal,
    onBoundary,
  } = options

  if (!isSpeechSupported()) {
    return Promise.reject(new Error('Leitura de áudio não suportada neste navegador'))
  }

  const chunks = splitIntoChunks(text)
  if (!chunks.length) return Promise.resolve()

  const synth = window.speechSynthesis
  const resolvedPitch =
    typeof pitch === 'number' ? pitch : gender === 'female' ? 1.05 : 0.92

  return (async () => {
    let aborted = false
    const onAbort = () => {
      aborted = true
      try {
        synth.cancel()
      } catch {
        /* ignore */
      }
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    try {
      // Chrome às vezes fica "preso" — resume ajuda
      if (synth.paused) synth.resume()

      for (let i = 0; i < chunks.length; i += 1) {
        if (aborted || signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError')
        }

        await new Promise((chunkResolve, chunkReject) => {
          const utterance = new SpeechSynthesisUtterance(chunks[i])
          utterance.lang = voice?.lang || 'pt-BR'
          if (voice) utterance.voice = voice
          utterance.rate = rate
          utterance.pitch = resolvedPitch
          utterance.volume = volume

          utterance.onend = () => chunkResolve()
          utterance.onerror = (event) => {
            if (event?.error === 'interrupted' || event?.error === 'canceled') {
              chunkReject(new DOMException('Aborted', 'AbortError'))
              return
            }
            chunkReject(new Error(event?.error || 'Erro na síntese de voz'))
          }
          if (onBoundary) {
            utterance.onboundary = (ev) => onBoundary(ev, chunks[i], i)
          }

          synth.speak(utterance)
        })

        // Pausa breve entre frases (efeito de professor pausado)
        if (i < chunks.length - 1) {
          await delay(280, signal)
        }
      }
    } finally {
      signal?.removeEventListener('abort', onAbort)
    }
  })()
}

export function cancelSpeech() {
  if (!isSpeechSupported()) return
  try {
    window.speechSynthesis.cancel()
  } catch {
    /* ignore */
  }
}

export function pauseSpeech() {
  if (!isSpeechSupported()) return
  try {
    window.speechSynthesis.pause()
  } catch {
    /* ignore */
  }
}

export function resumeSpeech() {
  if (!isSpeechSupported()) return
  try {
    window.speechSynthesis.resume()
  } catch {
    /* ignore */
  }
}

export function buildFlashcardIntro(index, total, materia = '') {
  const n = index + 1
  const subject = prepareSpeechText(materia)
  if (subject) {
    return `Flashcard ${n} de ${total}. Assunto: ${subject}.`
  }
  return `Flashcard ${n} de ${total}.`
}

export function buildNextCardCue(isLast) {
  if (isLast) return 'Chegamos ao último flashcard desta sessão. Parabéns pelo foco!'
  return 'Vamos ao próximo flashcard.'
}

export function buildMaterialIntro(title = '') {
  const t = prepareSpeechText(title)
  if (t) return `Vamos estudar o material: ${t}. Acompanhe com atenção.`
  return 'Vamos estudar este material. Acompanhe com atenção.'
}
