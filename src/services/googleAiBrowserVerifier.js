const REQUEST_TYPE = 'FCC_GOOGLE_AI_REQUEST'
const RESPONSE_TYPE = 'FCC_GOOGLE_AI_RESPONSE'
const READY_TYPE = 'FCC_GOOGLE_AI_READY'
const PING_TYPE = 'FCC_GOOGLE_AI_PING'
const CACHE_PREFIX = 'fcc-google-ai-dossier-v1:'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 190000

let extensionReady = false

if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return
    if (event.data?.type === READY_TYPE) extensionReady = true
  })
}

function normalize(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function hashText(value = '') {
  let hash = 2166136261
  const text = String(value)
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function cacheKey(meta = {}) {
  return `${CACHE_PREFIX}${hashText(
    [
      meta.courseId,
      meta.concursoName || meta.concurso,
      meta.cargo,
      meta.banca,
      meta.disciplina,
      meta.topicoNome || meta.topicKey,
    ].join('|'),
  )}`
}

function readCache(meta) {
  if (typeof window === 'undefined') return ''
  try {
    const raw = localStorage.getItem(cacheKey(meta))
    if (!raw) return ''
    const parsed = JSON.parse(raw)
    if (!parsed?.text || Date.now() - Number(parsed.createdAt || 0) > CACHE_TTL_MS) {
      localStorage.removeItem(cacheKey(meta))
      return ''
    }
    return String(parsed.text)
  } catch {
    return ''
  }
}

function writeCache(meta, text) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(
      cacheKey(meta),
      JSON.stringify({ text, createdAt: Date.now() }),
    )
  } catch {
    // Cache é otimização; falta de espaço não pode invalidar o dossiê atual.
  }
}

function buildDossierPrompt(meta = {}) {
  const concurso = normalize(meta.concursoName || meta.concurso || meta.courseName)
  const cargo = normalize(meta.cargo)
  const banca = normalize(meta.banca)
  const disciplina = normalize(meta.disciplina)
  const topico = normalize(meta.topicoNome || meta.topicKey)

  return `Atue como pesquisador factual para preparação de concurso público.

CONTEXTO OBRIGATÓRIO
Concurso: ${concurso || 'não informado'}
Cargo: ${cargo || 'não informado'}
Banca: ${banca || 'não informada'}
Disciplina: ${disciplina || 'não informada'}
Tópico exato: ${topico || 'não informado'}

Pesquise na web antes de responder. Produza um DOSSIÊ FACTUAL curto e suficiente
para gerar material, questões e flashcards fiéis a esse tópico.

REGRAS:
- Priorize fontes oficiais e primárias: legislação oficial, órgão do concurso,
  tribunal, governo, banca e edital.
- Confirme números de leis, artigos, datas, competências, prazos, exceções e
  conceitos antes de escrevê-los.
- Se uma afirmação não puder ser confirmada, omita-a. Não complete lacunas.
- Destaque pegadinhas da banca somente quando sustentadas pelas fontes.
- Não misture assuntos vizinhos nem conteúdo genérico da disciplina.
- Informe divergências ou atualização normativa relevante.
- Inclua no fim uma lista curta de URLs/fontes consultadas.
- Não crie questões ou flashcards agora; entregue somente fatos verificados.

Delimite exatamente assim:
FCC_DOSSIER_START
[dossiê factual]
FCC_DOSSIER_END`
}

function requestExtension(prompt) {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('A verificação local exige um navegador.'))
  }

  return new Promise((resolve, reject) => {
    const requestId = `fcc-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage)
      if (window.__fccGoogleAiCallbacks) delete window.__fccGoogleAiCallbacks[requestId]
      reject(new Error('Tempo esgotado aguardando o Modo IA do Google.'))
    }, REQUEST_TIMEOUT_MS)

    function onMessage(event) {
      if (event.source !== window || event.origin !== window.location.origin) return
      const data = event.data
      if (data?.type !== RESPONSE_TYPE || data.requestId !== requestId) return
      clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      if (!data.ok) {
        reject(new Error(data.error || 'A extensão não conseguiu consultar o Google.'))
        return
      }
      resolve(String(data.result || '').trim())
    }

    window.addEventListener('message', onMessage)

    if (window.FlashConCardsAndroid?.requestGoogleAi) {
      window.__fccGoogleAiCallbacks = window.__fccGoogleAiCallbacks || {}
      window.__fccGoogleAiCallbacks[requestId] = { resolve, reject, timer, onMessage }
      window.__fccGoogleAiResolve = (id, ok, result, errorMessage) => {
        const callback = window.__fccGoogleAiCallbacks?.[id]
        if (!callback) return
        clearTimeout(callback.timer)
        window.removeEventListener('message', callback.onMessage)
        delete window.__fccGoogleAiCallbacks[id]
        if (ok) callback.resolve(String(result || '').trim())
        else callback.reject(new Error(errorMessage || 'O aplicativo Android não conseguiu consultar o Google.'))
      }
      window.FlashConCardsAndroid.requestGoogleAi(requestId, prompt)
      return
    }

    window.postMessage({ type: REQUEST_TYPE, requestId, prompt }, window.location.origin)
  })
}

function ensureExtensionReady(timeoutMs = 1500) {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (window.FlashConCardsAndroid?.requestGoogleAi) {
    extensionReady = true
    return Promise.resolve(true)
  }
  return new Promise((resolve) => {
    const requestId = `fcc-ping-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage)
      resolve(false)
    }, timeoutMs)

    function onMessage(event) {
      if (event.source !== window || event.origin !== window.location.origin) return
      const data = event.data
      if (data?.type !== READY_TYPE || data.requestId !== requestId) return
      clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      extensionReady = true
      resolve(true)
    }

    window.addEventListener('message', onMessage)
    window.postMessage({ type: PING_TYPE, requestId }, window.location.origin)
  })
}

export async function getGoogleAiTopicDossier(meta = {}, { forceFresh = false } = {}) {
  if (!forceFresh) {
    const cached = readCache(meta)
    if (cached) return { text: cached, cached: true }
  }

  const prompt = buildDossierPrompt(meta)
  let text
  try {
    const available = extensionReady || (await ensureExtensionReady())
    if (!available) throw new Error('Extensão não detectada.')
    text = await requestExtension(prompt)
  } catch (error) {
    const wrapped = new Error(
      extensionReady
        ? `Google AI local indisponível: ${error?.message || error}`
        : 'App Android FlashConCards Admin (ou extensão Chrome) não detectado. Abra o admin pelo app e toque em “Automatizar hoje”.',
    )
    wrapped.code = 'google_ai_bridge_unavailable'
    throw wrapped
  }

  if (text.length < 120) {
    const error = new Error('O dossiê factual retornado pelo Google está incompleto.')
    error.code = 'google_ai_dossier_invalid'
    throw error
  }

  writeCache(meta, text)
  return { text, cached: false }
}

/** Nunca bloqueia a geração: tenta app web admin → ponte → segue sem dossiê. */
export async function getGoogleAiTopicDossierOptional(meta = {}, options = {}) {
  try {
    if (!options.forceFresh) {
      const cached = readCache(meta)
      if (cached) return { text: cached, cached: true }
    }

    // App interno /admin/modo-ia — busca Google pelo browser do admin (sem download)
    try {
      const { fetchAdminModoIaDossier } = await import('./googleAiWebDossierService')
      const web = await fetchAdminModoIaDossier(meta, {
        forceFresh: options.forceFresh,
        onStatus: options.onStatus,
      })
      if (web?.text && web.text.length >= 120) {
        writeCache(meta, web.text)
        return { text: web.text, cached: false, source: web.source }
      }
    } catch {
      // continua
    }

    const bridge = await detectGoogleAiBridge()
    if (!bridge.available) return { text: '', cached: false, skipped: true }
    return await getGoogleAiTopicDossier(meta, options)
  } catch {
    return { text: '', cached: false, skipped: true }
  }
}

export function appendGoogleAiDossier(prompt = '', dossier = '') {
  const text = String(dossier || '').trim()
  if (!text) return prompt
  return `${prompt}

═══ DOSSIÊ FACTUAL DO GOOGLE — FONTE DE VERDADE ═══
${text}
═══ FIM DO DOSSIÊ ═══

Use EXCLUSIVAMENTE os fatos confirmados no dossiê para afirmações específicas.
Se o dossiê não confirmar lei, artigo, data, prazo ou exceção, omita esse dado.
Não contradiga nem extrapole o dossiê.`
}

/** Detecta ponte local: app Android ou extensão Chrome. */
export async function detectGoogleAiBridge() {
  if (typeof window === 'undefined') {
    return { available: false, kind: null }
  }
  if (window.FlashConCardsAndroid?.requestGoogleAi) {
    extensionReady = true
    return { available: true, kind: 'android' }
  }
  const ready = await ensureExtensionReady()
  if (ready || extensionReady) {
    return { available: true, kind: 'extension' }
  }
  return { available: false, kind: null }
}

export function openFlashConCardsAndroidApp() {
  if (typeof window === 'undefined') return
  const fallback = `${window.location.origin}/admin?tab=guia-mentorado`
  // Scheme customizado do app; se não estiver instalado, o intent HTTPS tenta o package.
  window.location.href = 'fccadmin://open'
  setTimeout(() => {
    const intent =
      'intent://www.flashconcards.com.br/admin?tab=guia-mentorado#Intent;' +
      'scheme=https;package=br.com.flashconcards.admin;' +
      `S.browser_fallback_url=${encodeURIComponent(fallback)};end`
    window.location.href = intent
  }, 700)
}

