/**
 * Motor de fala do Modo Professor — GRATUITO (Web Speech API).
 * Não usa Gemini / não gasta API.
 * Prioriza vozes Natural/Neural modernas; evita Assistente Google antigo.
 */

const STORAGE_KEY = 'flashconcards.smartTeacher.v3'

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
  gender: 'female',
  voiceURI: '',
  thinkSeconds: 15,
  speechRate: 0.95,
  autoAdvance: true,
}

/** Vozes antigas / Assistente Google — evitar */
const BLOCKED_VOICE_HINTS = [
  'regina', 'bittar', 'yasmin', 'yasmim', 'yasin',
  'google português', 'google portugues', 'google brasil',
  'chrome os', 'android', 'espeak', 'pico', 'festival',
  'microsoft maria - portuguese', // voz antiga SAPI, não Natural
  'microsoft daniel - portuguese',
]

const FEMALE_HINTS = [
  'female', 'woman', 'feminina', 'mulher',
  'francisca', 'thalita', 'maria', 'luciana', 'helena', 'gabriela',
  'vitória', 'vitoria', 'fernanda', 'camila', 'ana', 'julia', 'júlia',
  'beatriz', 'isabela', 'daniela', 'patricia', 'patrícia', 'sara',
  'sofia', 'joana', 'ines', 'inês', 'amalia', 'amália', 'raquel',
  'catarina', 'lucia', 'lúcia', 'fernanda', 'leticia', 'letícia',
]

const MALE_HINTS = [
  'male', 'man', 'masculina', 'masculino', 'homem',
  'antonio', 'antónio', 'daniel', 'felipe', 'ricardo', 'thiago', 'tiago',
  'joao', 'joão', 'pedro', 'carlos', 'paulo', 'lucas', 'bruno', 'rafael',
  'gustavo', 'marcelo', 'rodrigo', 'andre', 'andré', 'heitor', 'nicolas',
  'nicolás', 'diego', 'felipe', 'gabriel', 'miguel', 'henrique',
]

/** Sinais de voz moderna / neural (2023–2026) */
const MODERN_HINTS = [
  'natural', 'neural', 'online (natural)', 'online natural',
  'enhanced', 'premium', 'superstar', 'eloquent', 'personal',
  'wavenet', 'studio', 'journey', 'polyglot', 'generative',
]

function loadRawSettings() {
  if (typeof window === 'undefined') return { ...DEFAULT_TEACHER_SETTINGS }
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ||
      localStorage.getItem('flashconcards.smartTeacher.v2') ||
      localStorage.getItem('flashconcards.smartTeacher.v1')
    if (!raw) return { ...DEFAULT_TEACHER_SETTINGS }
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_TEACHER_SETTINGS,
      gender: parsed.gender === 'male' ? 'male' : 'female',
      voiceURI: typeof parsed.voiceURI === 'string' ? parsed.voiceURI : '',
      thinkSeconds: Number(parsed.thinkSeconds) || 15,
      speechRate: Number(parsed.speechRate) > 0 ? Number(parsed.speechRate) : 0.95,
      autoAdvance: parsed.autoAdvance !== false,
    }
  } catch {
    return { ...DEFAULT_TEACHER_SETTINGS }
  }
}

export function getTeacherSettings() {
  return loadRawSettings()
}

export function saveTeacherSettings(partial) {
  const current = loadRawSettings()
  const next = { ...current, ...partial }
  if (partial?.gender && partial.gender !== current.gender && partial.voiceURI === undefined) {
    // troca de gênero → limpa URI para escolher a melhor do novo gênero
    next.voiceURI = ''
  }
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
  return next
}

export function isSpeechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function waitForVoices(timeoutMs = 3000) {
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
    // Alguns browsers precisam de um getVoices “kick”
    window.speechSynthesis.getVoices()
    setTimeout(finish, timeoutMs)
  })
}

function voiceKey(voice) {
  return `${voice?.name || ''} ${voice?.voiceURI || ''}`.toLowerCase()
}

function isBlockedVoice(voice) {
  const key = voiceKey(voice)
  return BLOCKED_VOICE_HINTS.some((hint) => key.includes(hint))
}

function langScore(voice) {
  const lang = (voice.lang || '').toLowerCase().replace('_', '-')
  if (lang === 'pt-br' || lang.startsWith('pt-br')) return 120
  if (lang.startsWith('pt')) return 80
  return 0
}

function modernScore(voice) {
  const key = voiceKey(voice)
  let score = 0
  for (const hint of MODERN_HINTS) {
    if (key.includes(hint)) score += 40
  }
  // Microsoft Online Natural costuma ser a melhor opção gratuita no Edge/Windows
  if (key.includes('microsoft') && key.includes('natural')) score += 50
  if (key.includes('microsoft') && key.includes('online')) score += 25
  if (key.includes('apple') && (key.includes('enhanced') || key.includes('premium'))) score += 45
  if (key.includes('samsung') && key.includes('neural')) score += 30
  // Vozes “online” do Edge soam bem mais atuais
  if (voice.localService === false) score += 12
  return score
}

function genderHits(voice) {
  const key = voiceKey(voice)
  const female = FEMALE_HINTS.filter((h) => key.includes(h)).length
  const male = MALE_HINTS.filter((h) => key.includes(h)).length
  return { female, male }
}

export function detectVoiceGender(voice) {
  const { female, male } = genderHits(voice)
  if (male > female) return 'male'
  if (female > male) return 'female'
  return 'unknown'
}

export function scoreVoiceForTeacher(voice, gender = 'female') {
  if (!voice) return -Infinity
  if (isBlockedVoice(voice)) return -2000
  const lang = langScore(voice)
  if (lang <= 0) return -1000

  let score = lang + modernScore(voice)
  const { female, male } = genderHits(voice)

  if (gender === 'female') {
    if (female > 0) score += 55 + female * 10
    if (male > 0 && female === 0) score -= 80
  } else {
    if (male > 0) score += 55 + male * 10
    if (female > 0 && male === 0) score -= 80
  }

  // Preferir nomes conhecidos modernos pt-BR
  const key = voiceKey(voice)
  if (gender === 'female' && (key.includes('francisca') || key.includes('thalita'))) score += 35
  if (gender === 'male' && (key.includes('antonio') || key.includes('antónio') || key.includes('heitor'))) {
    score += 35
  }

  return score
}

export function listTeacherVoices(voices, gender = 'female') {
  const list = Array.isArray(voices) ? voices : []
  const ranked = list
    .map((voice) => ({ voice, score: scoreVoiceForTeacher(voice, gender), gender: detectVoiceGender(voice) }))
    .filter((entry) => {
      if (entry.score <= -500) return false
      // Não misturar gêneros no seletor (corrige “masculina não aparece” / lista errada)
      if (gender === 'male' && entry.gender === 'female') return false
      if (gender === 'female' && entry.gender === 'male') return false
      return true
    })
    .sort((a, b) => b.score - a.score)

  if (ranked.length) return ranked.map((entry) => entry.voice)

  // Fallback: só vozes com sinal claro do gênero pedido
  return list
    .filter((v) => {
      if (langScore(v) <= 0 || isBlockedVoice(v)) return false
      const g = detectVoiceGender(v)
      return g === gender || g === 'unknown'
    })
    .sort((a, b) => scoreVoiceForTeacher(b, gender) - scoreVoiceForTeacher(a, gender))
}

export function pickTeacherVoice(voices, gender = 'female', preferredURI = '') {
  const list = Array.isArray(voices) ? voices : []
  if (!list.length) return null

  if (preferredURI) {
    const exact = list.find((v) => v.voiceURI === preferredURI || v.name === preferredURI)
    if (exact && !isBlockedVoice(exact)) return exact
  }

  const ranked = listTeacherVoices(list, gender)
  if (ranked.length) return ranked[0]

  const pt = list.find((v) => langScore(v) > 0 && !isBlockedVoice(v))
  return pt || list.find((v) => !isBlockedVoice(v)) || list[0] || null
}

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

  const parts = prepared
    .split(/(?<=[.!?…;:])\s+|\n+/)
    .map((p) => p.trim())
    .filter(Boolean)

  const chunks = []
  let buffer = ''
  for (const part of parts) {
    if ((buffer + ' ' + part).trim().length < 200) {
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
 * Lê texto com Web Speech gratuito (voz moderna do aparelho).
 */
export function speakText(text, options = {}) {
  const {
    voice = null,
    gender = 'female',
    rate = 0.95,
    pitch,
    volume = 1,
    signal,
  } = options

  if (!isSpeechSupported()) {
    return Promise.reject(new Error('Leitura de áudio não suportada neste navegador'))
  }

  const chunks = splitIntoChunks(text)
  if (!chunks.length) return Promise.resolve()

  const synth = window.speechSynthesis
  const resolvedPitch =
    typeof pitch === 'number' ? pitch : gender === 'female' ? 1.04 : 0.9

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

          synth.speak(utterance)
        })

        if (i < chunks.length - 1) {
          await delay(260, signal)
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
  if (subject) return `Flashcard ${n} de ${total}. Assunto: ${subject}.`
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

export function formatVoiceLabel(voice) {
  if (!voice) return 'Voz do sistema'
  const modern = modernScore(voice) >= 40
  const gender = detectVoiceGender(voice)
  const tag = modern ? 'moderna' : 'padrão'
  const g = gender === 'male' ? '♂' : gender === 'female' ? '♀' : ''
  return `${voice.name} ${g} · ${tag}`.trim()
}
