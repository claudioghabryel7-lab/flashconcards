/**
 * App interno (rota admin): busca automática no Google Modo IA / resultados
 * pelo navegador do admin (sem baixar extensão/APK).
 *
 * Usa leitor r.jina.ai a partir do IP do admin. Se o Google bloquear (CAPTCHA),
 * faz dossiê com Gemini + Google Search grounding — ainda automático.
 */

import { generateAiJson } from '../utils/geminiApi'
import { normalizeExamContext } from '../utils/examFidelityContext'

const CACHE_PREFIX = 'fcc-web-modo-ia-v1:'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

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

export function modoIaCacheKey(meta = {}) {
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
    const raw = localStorage.getItem(modoIaCacheKey(meta))
    if (!raw) return ''
    const parsed = JSON.parse(raw)
    if (!parsed?.text || Date.now() - Number(parsed.createdAt || 0) > CACHE_TTL_MS) {
      localStorage.removeItem(modoIaCacheKey(meta))
      return ''
    }
    return String(parsed.text)
  } catch {
    return ''
  }
}

function writeCache(meta, text, source = 'web') {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(
      modoIaCacheKey(meta),
      JSON.stringify({ text, source, createdAt: Date.now() }),
    )
  } catch {
    // ignore
  }
}

export function buildModoIaQuery(meta = {}) {
  const exam = normalizeExamContext(meta)
  const topico = normalize(meta.topicoNome || meta.topicKey)
  const disciplina = normalize(meta.disciplina)
  const parts = [
    topico,
    disciplina,
    exam.concursoName,
    exam.cargo,
    exam.banca,
    'legislação vigente fontes oficiais',
  ].filter(Boolean)
  return parts.join(' ')
}

function buildResearchPrompt(meta = {}) {
  const exam = normalizeExamContext(meta)
  const topico = normalize(meta.topicoNome || meta.topicKey)
  return `Atue como o Modo IA do Google: pesquise com Google Search e produza um DOSSIÊ FACTUAL.

Concurso: ${exam.concursoName || 'n/d'}
Cargo: ${exam.cargo || 'n/d'}
Banca: ${exam.banca || 'n/d'}
Disciplina: ${normalize(meta.disciplina) || 'n/d'}
Tópico: ${topico || 'n/d'}

Regras:
- Priorize fontes oficiais (Planalto, gov.br, tribunais, edital, banca).
- Confirme leis, artigos, datas e exceções. Se não confirmar, omita.
- Não invente. Não misture outro tópico.
- Inclua fontes/URLs no fim.

Retorne JSON:
{ "dossier": "texto do dossiê factual completo" }`
}

async function fetchGoogleViaJina(query) {
  const urls = [
    `https://r.jina.ai/http://www.google.com/search?hl=pt-BR&udm=50&q=${encodeURIComponent(query)}`,
    `https://r.jina.ai/https://www.google.com/search?hl=pt-BR&udm=50&q=${encodeURIComponent(query)}`,
    `https://r.jina.ai/http://www.google.com/search?hl=pt-BR&q=${encodeURIComponent(query)}`,
  ]

  let lastError = null
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'text/plain' },
        cache: 'no-store',
      })
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`)
        continue
      }
      const text = String(await res.text() || '').trim()
      const lower = text.toLowerCase()
      if (
        text.length < 200 ||
        lower.includes('captcha') ||
        lower.includes('tráfego incomum') ||
        lower.includes('unusual traffic') ||
        lower.includes('too many requests')
      ) {
        lastError = new Error('Google bloqueou a leitura (CAPTCHA/limite).')
        continue
      }
      return text.slice(0, 24000)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('Falha ao ler o Google.')
}

async function buildDossierFromGoogleText(meta, googleText) {
  const exam = normalizeExamContext(meta)
  const topico = normalize(meta.topicoNome || meta.topicKey)
  const parsed = await generateAiJson(
    `Com base EXCLUSIVAMENTE no texto abaixo (resultado do Google/Modo IA), monte um dossiê factual curto para o tópico.

Concurso: ${exam.concursoName || 'n/d'}
Cargo: ${exam.cargo || 'n/d'}
Banca: ${exam.banca || 'n/d'}
Disciplina: ${normalize(meta.disciplina) || 'n/d'}
Tópico: ${topico || 'n/d'}

TEXTO DO GOOGLE:
${googleText.slice(0, 18000)}

Regras:
- Use só o que estiver no texto. Sem inventar lei/artigo.
- Se o texto for genérico/CAPTCHA, retorne dossier vazio.
- Inclua fontes citadas no texto.

JSON: { "dossier": "..." }`,
    {
      courseId: meta.courseId,
      useGoogleSearch: false,
      verifyContent: false,
      forceAudit: false,
      trustedGeneration: true,
      generationConfig: { temperature: 0, maxOutputTokens: 8192 },
      courseContext: {
        banca: exam.banca,
        cargo: exam.cargo,
        concursoName: exam.concursoName,
        disciplina: meta.disciplina,
        topicoNome: topico,
      },
    },
  )
  return String(parsed?.dossier || '').trim()
}

async function buildDossierWithGeminiSearch(meta) {
  const parsed = await generateAiJson(buildResearchPrompt(meta), {
    courseId: meta.courseId,
    useGoogleSearch: true,
    searchGrounded: true,
    verifyContent: false,
    forceAudit: false,
    trustedGeneration: true,
    generationConfig: { temperature: 0, maxOutputTokens: 8192 },
    courseContext: {
      banca: meta.banca,
      cargo: meta.cargo,
      concursoName: meta.concursoName || meta.concurso,
      disciplina: meta.disciplina,
      topicoNome: meta.topicoNome || meta.topicKey,
    },
  })
  return String(parsed?.dossier || '').trim()
}

/**
 * Dossiê automático para um tópico (roda no browser do admin).
 */
export async function fetchAdminModoIaDossier(meta = {}, { forceFresh = false, onStatus } = {}) {
  if (!forceFresh) {
    const cached = readCache(meta)
    if (cached) return { text: cached, source: 'cache', cached: true }
  }

  const query = buildModoIaQuery(meta)
  onStatus?.('Consultando Google (Modo IA / busca)…')

  try {
    const googleText = await fetchGoogleViaJina(query)
    onStatus?.('Extraindo dossiê factual…')
    const dossier = await buildDossierFromGoogleText(meta, googleText)
    if (dossier.length >= 120) {
      writeCache(meta, dossier, 'google_web')
      return { text: dossier, source: 'google_web', cached: false }
    }
  } catch {
    // segue para fallback automático
  }

  onStatus?.('Google bloqueou a leitura — usando Gemini Search automático…')
  const fallback = await buildDossierWithGeminiSearch(meta)
  if (fallback.length < 120) {
    const err = new Error('Não foi possível montar dossiê factual automático.')
    err.code = 'modo_ia_dossier_failed'
    throw err
  }
  writeCache(meta, fallback, 'gemini_search')
  return { text: fallback, source: 'gemini_search', cached: false }
}
