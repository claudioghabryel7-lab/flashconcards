/**
 * Motor de fala do Modo Professor — vozes Gemini Live (TTS).
 * Aoede, Despina, Kore, Sulafat, Vindemiatrix, Zephyr, Charon, Orus, etc.
 * Não usa Web Speech / Assistente Google (Regina, Yasmin…).
 */

const STORAGE_KEY = 'flashconcards.smartTeacher.v2'

export const THINK_TIME_OPTIONS = [
  { value: 5, label: '5 segundos' },
  { value: 10, label: '10 segundos' },
  { value: 15, label: '15 segundos' },
  { value: 20, label: '20 segundos' },
  { value: 30, label: '30 segundos' },
  { value: 45, label: '45 segundos' },
  { value: 60, label: '1 minuto' },
]

/** Catálogo Gemini Live / Gemini TTS */
export const GEMINI_LIVE_VOICES = {
  female: [
    { id: 'Aoede', label: 'Aoede', hint: 'Leve e envolvente' },
    { id: 'Despina', label: 'Despina', hint: 'Suave' },
    { id: 'Kore', label: 'Kore', hint: 'Firme' },
    { id: 'Sulafat', label: 'Sulafat', hint: 'Acolhedora' },
    { id: 'Vindemiatrix', label: 'Vindemiatrix', hint: 'Gentil' },
    { id: 'Zephyr', label: 'Zephyr', hint: 'Brilhante' },
    { id: 'Leda', label: 'Leda', hint: 'Jovem' },
    { id: 'Achernar', label: 'Achernar', hint: 'Macia' },
    { id: 'Callirrhoe', label: 'Callirrhoe', hint: 'Descontraída' },
    { id: 'Autonoe', label: 'Autonoe', hint: 'Clara' },
    { id: 'Erinome', label: 'Erinome', hint: 'Nítida' },
    { id: 'Gacrux', label: 'Gacrux', hint: 'Madura' },
    { id: 'Laomedeia', label: 'Laomedeia', hint: 'Animada' },
    { id: 'Pulcherrima', label: 'Pulcherrima', hint: 'Direta' },
  ],
  male: [
    { id: 'Charon', label: 'Charon', hint: 'Informativo' },
    { id: 'Orus', label: 'Orus', hint: 'Firme' },
    { id: 'Puck', label: 'Puck', hint: 'Animado' },
    { id: 'Fenrir', label: 'Fenrir', hint: 'Energético' },
    { id: 'Alnilam', label: 'Alnilam', hint: 'Firme' },
    { id: 'Schedar', label: 'Schedar', hint: 'Equilibrado' },
    { id: 'Iapetus', label: 'Iapetus', hint: 'Claro' },
    { id: 'Umbriel', label: 'Umbriel', hint: 'Descontraído' },
    { id: 'Algieba', label: 'Algieba', hint: 'Suave' },
    { id: 'Enceladus', label: 'Enceladus', hint: 'Aéreo' },
    { id: 'Rasalgethi', label: 'Rasalgethi', hint: 'Didático' },
    { id: 'Sadaltager', label: 'Sadaltager', hint: 'Conhecedor' },
    { id: 'Achird', label: 'Achird', hint: 'Amigável' },
    { id: 'Sadachbia', label: 'Sadachbia', hint: 'Vivo' },
    { id: 'Zubenelgenubi', label: 'Zubenelgenubi', hint: 'Casual' },
    { id: 'Algenib', label: 'Algenib', hint: 'Grave' },
  ],
}

export const DEFAULT_TEACHER_SETTINGS = {
  gender: 'female',
  voiceName: 'Aoede',
  thinkSeconds: 15,
  speechRate: 1,
  autoAdvance: true,
}

function defaultVoiceForGender(gender) {
  return gender === 'male' ? 'Charon' : 'Aoede'
}

function loadRawSettings() {
  if (typeof window === 'undefined') return { ...DEFAULT_TEACHER_SETTINGS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    // migra v1 (Web Speech) → v2 (Gemini Live)
    const legacy = !raw ? localStorage.getItem('flashconcards.smartTeacher.v1') : null
    const parsed = raw ? JSON.parse(raw) : legacy ? JSON.parse(legacy) : null
    if (!parsed) return { ...DEFAULT_TEACHER_SETTINGS }
    const gender = parsed.gender === 'male' ? 'male' : 'female'
    const catalog = GEMINI_LIVE_VOICES[gender] || GEMINI_LIVE_VOICES.female
    const voiceName = catalog.some((v) => v.id === parsed.voiceName)
      ? parsed.voiceName
      : defaultVoiceForGender(gender)
    return {
      ...DEFAULT_TEACHER_SETTINGS,
      ...parsed,
      gender,
      voiceName,
      speechRate: Number(parsed.speechRate) > 0 ? Number(parsed.speechRate) : 1,
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
  if (partial?.gender && partial.gender !== current.gender && !partial.voiceName) {
    next.voiceName = defaultVoiceForGender(partial.gender)
  }
  const catalog = GEMINI_LIVE_VOICES[next.gender] || GEMINI_LIVE_VOICES.female
  if (!catalog.some((v) => v.id === next.voiceName)) {
    next.voiceName = defaultVoiceForGender(next.gender)
  }
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
  return next
}

export function listGeminiVoices(gender = 'female') {
  return GEMINI_LIVE_VOICES[gender] || GEMINI_LIVE_VOICES.female
}

export function resolveTeacherVoice(settings = getTeacherSettings()) {
  const gender = settings.gender === 'male' ? 'male' : 'female'
  const catalog = listGeminiVoices(gender)
  const found = catalog.find((v) => v.id === settings.voiceName)
  return found || catalog[0]
}

export function isSpeechSupported() {
  return typeof window !== 'undefined' && typeof Audio !== 'undefined' && typeof fetch === 'function'
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

function splitIntoChunks(text, maxLen = 700) {
  const prepared = prepareSpeechText(text)
  if (!prepared) return []

  const parts = prepared
    .split(/(?<=[.!?…;:])\s+|\n+/)
    .map((p) => p.trim())
    .filter(Boolean)

  const chunks = []
  let buffer = ''
  for (const part of parts) {
    if (!buffer) {
      buffer = part
      continue
    }
    if (`${buffer} ${part}`.length <= maxLen) {
      buffer = `${buffer} ${part}`
    } else {
      chunks.push(buffer)
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

function base64ToUint8Array(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function parsePcmSampleRate(mimeType = '') {
  const match = String(mimeType).match(/rate\s*=\s*(\d+)/i)
  return match ? Number(match[1]) : 24000
}

/** Empacota PCM 16-bit mono em WAV para o <audio> do navegador. */
export function pcmBase64ToWavBlob(base64, mimeType = 'audio/L16;rate=24000') {
  const pcm = base64ToUint8Array(base64)
  const sampleRate = parsePcmSampleRate(mimeType)
  const numChannels = 1
  const bitsPerSample = 16
  const blockAlign = (numChannels * bitsPerSample) / 8
  const byteRate = sampleRate * blockAlign
  const dataSize = pcm.length
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)

  new Uint8Array(buffer, 44).set(pcm)
  return new Blob([buffer], { type: 'audio/wav' })
}

function audioBlobFromTtsResponse({ audioBase64, mimeType }) {
  const mime = String(mimeType || '')
  if (mime.includes('wav') || mime.includes('mp3') || mime.includes('mpeg') || mime.includes('ogg')) {
    return new Blob([base64ToUint8Array(audioBase64)], { type: mime.split(';')[0] || 'audio/wav' })
  }
  // Gemini TTS costuma devolver PCM cru
  return pcmBase64ToWavBlob(audioBase64, mimeType)
}

let currentAudio = null
let currentObjectUrl = null

function clearCurrentAudio() {
  if (currentAudio) {
    try {
      currentAudio.onended = null
      currentAudio.onerror = null
      currentAudio.pause()
      currentAudio.removeAttribute('src')
      currentAudio.load()
    } catch {
      /* ignore */
    }
  }
  currentAudio = null
  if (currentObjectUrl) {
    try {
      URL.revokeObjectURL(currentObjectUrl)
    } catch {
      /* ignore */
    }
  }
  currentObjectUrl = null
}

async function fetchGeminiTtsChunk(text, { voiceName, signal } = {}) {
  const response = await fetch('/api/gemini/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voiceName,
      styleHint:
        'Leia em português do Brasil com a qualidade das vozes do Gemini Live. Tom de professor(a) persuasivo(a), belo, claro e pausado — nunca mecânico ou de assistente de voz barato.',
    }),
    signal,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || `Falha no TTS Gemini (${response.status})`)
  }
  if (!data.audioBase64) {
    throw new Error('TTS Gemini não retornou áudio')
  }
  return data
}

function playHtmlAudio(blob, { rate = 1, signal } = {}) {
  return new Promise((resolve, reject) => {
    clearCurrentAudio()
    const url = URL.createObjectURL(blob)
    currentObjectUrl = url
    const audio = new Audio(url)
    currentAudio = audio
    audio.playbackRate = Math.min(1.5, Math.max(0.7, Number(rate) || 1))

    const onAbort = () => {
      clearCurrentAudio()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    audio.onended = () => {
      signal?.removeEventListener('abort', onAbort)
      clearCurrentAudio()
      resolve()
    }
    audio.onerror = () => {
      signal?.removeEventListener('abort', onAbort)
      clearCurrentAudio()
      reject(new Error('Falha ao reproduzir áudio Gemini'))
    }

    audio.play().catch((err) => {
      signal?.removeEventListener('abort', onAbort)
      clearCurrentAudio()
      reject(err)
    })
  })
}

/**
 * Lê texto com voz Gemini Live. Retorna Promise que resolve ao terminar.
 */
export async function speakText(text, options = {}) {
  const {
    voiceName = getTeacherSettings().voiceName,
    rate = getTeacherSettings().speechRate,
    signal,
  } = options

  if (!isSpeechSupported()) {
    throw new Error('Reprodução de áudio não suportada neste navegador')
  }

  const chunks = splitIntoChunks(text)
  if (!chunks.length) return

  for (let i = 0; i < chunks.length; i += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const tts = await fetchGeminiTtsChunk(chunks[i], { voiceName, signal })
    const blob = audioBlobFromTtsResponse(tts)
    await playHtmlAudio(blob, { rate, signal })
    if (i < chunks.length - 1) {
      await delay(180, signal)
    }
  }
}

export function cancelSpeech() {
  clearCurrentAudio()
}

export function pauseSpeech() {
  try {
    currentAudio?.pause()
  } catch {
    /* ignore */
  }
}

export function resumeSpeech() {
  try {
    const p = currentAudio?.play()
    if (p?.catch) p.catch(() => {})
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

// Compat: APIs antigas do Web Speech — mantidas como no-op / stubs
export function waitForVoices() {
  return Promise.resolve(listGeminiVoices('female').concat(listGeminiVoices('male')))
}

export function pickTeacherVoice(_voices, gender = 'female') {
  const settings = getTeacherSettings()
  const g = gender || settings.gender
  const voice = resolveTeacherVoice({ ...settings, gender: g })
  return { name: voice.label, lang: 'pt-BR', voiceURI: voice.id, geminiVoice: voice.id }
}
