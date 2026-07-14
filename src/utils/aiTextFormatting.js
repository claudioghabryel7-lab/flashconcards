/** Normaliza texto gerado por IA: remove markdown cru e prepara leitura confortável. */

import { alternativasAsOrderedObject } from './questaoAlternativas.js'

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function normalizeCommentInput(text = '') {
  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
    .replace(/\t/g, '  ')
    .replace(/[ \u00A0]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
}

export function smartParagraphize(text = '') {
  let s = normalizeCommentInput(text)
  if (!s) return ''

  s = s
    .split('\n')
    .map((line) => line.trim())
    .join('\n')

  s = s.replace(/\)([A-ZÁÉÍÓÚÀÊÔÂÃÕÇ])/g, ')\n\n$1')
  s = s.replace(
    /([.!?])\s*(?=(Exemplo|Elementos|Critérios|Identidade|Ser |Para |Uma |O texto|A afirmação|\d+[)]))/gi,
    '$1\n\n',
  )
  s = s.replace(/\.(?=[A-ZÁÉÍÓÚÀÊÔÂÃÕÇ])/g, '.\n\n')
  s = s.replace(/:(?=[A-ZÁÉÍÓÚÀÊÔÂÃÕÇ])/g, ':\n\n')
  s = s.replace(/([.!?])\s*(?=- )/g, '$1\n\n')
  s = s.replace(/\n{3,}/g, '\n\n')

  return s.trim()
}

export function hasMarkdownArtifacts(text = '') {
  return /(\*\*[^*]+\*\*|__[^_]+__|(?<![\w*])\*[^*\n]+\*(?!\*)|^[\s]*[-*•]\s+)/m.test(
    String(text || ''),
  )
}

function applyInlineMarkdown(text = '') {
  return String(text || '')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(?<![\w*])\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
}

/** Converte markdown inline em HTML (<strong>, <em>). */
export function normalizeMarkdownToHtml(text = '') {
  const raw = String(text || '').trim()
  if (!raw) return ''

  if (/<[a-z][\s\S]*>/i.test(raw)) {
    return applyInlineMarkdown(raw)
  }

  const paragraphized = smartParagraphize(raw)
  const lines = paragraphized.split('\n')
  const parts = []
  let listBuffer = []

  const flushList = () => {
    if (!listBuffer.length) return
    parts.push(
      `<ul>${listBuffer.map((item) => `<li>${applyInlineMarkdown(escapeHtml(item))}</li>`).join('')}</ul>`,
    )
    listBuffer = []
  }

  for (const line of lines) {
    const bullet = line.match(/^\s*[-*•]\s+(.+)$/)
    if (bullet) {
      listBuffer.push(bullet[1].trim())
      continue
    }

    flushList()
    const trimmed = line.trim()
    if (!trimmed) continue
    parts.push(`<p class="material-paragraph">${applyInlineMarkdown(escapeHtml(trimmed))}</p>`)
  }

  flushList()
  return parts.join('') || `<p class="material-paragraph">${applyInlineMarkdown(escapeHtml(paragraphized))}</p>`
}

/** Texto plano legível (flashcards, enunciados) — sem asteriscos soltos. */
export function prepareAiTextForDisplay(text = '') {
  let s = smartParagraphize(String(text || ''))
  if (!s) return ''

  s = s
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/(?<![\w*])\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/^\s*[-*•]\s+/gm, '• ')

  return s.trim()
}

export function sanitizeFlashcardText(text = '') {
  return prepareAiTextForDisplay(text)
}

export function sanitizeQuestaoText(text = '') {
  return prepareAiTextForDisplay(text)
}

export function sanitizeQuestaoAlternativas(alternativas) {
  if (!alternativas) return alternativas
  if (Array.isArray(alternativas)) {
    return alternativasAsOrderedObject(
      Object.fromEntries(
        alternativas.map((alt, i) => {
          const letra = String.fromCharCode(65 + i)
          if (alt == null) return [letra, '']
          if (typeof alt === 'string' || typeof alt === 'number') return [letra, sanitizeQuestaoText(alt)]
          const key = String(alt.letra || alt.key || letra).trim().toUpperCase() || letra
          return [key, sanitizeQuestaoText(alt.texto ?? alt.text ?? alt.conteudo ?? '')]
        }),
      ),
    )
  }
  if (typeof alternativas === 'object') {
    return alternativasAsOrderedObject(
      Object.fromEntries(
        Object.entries(alternativas).map(([key, value]) => [key, sanitizeQuestaoText(value)]),
      ),
    )
  }
  return alternativas
}

/** Instrução padrão para prompts de geração IA (texto simples: flashcards, enunciados). */
export const AI_TEXT_FORMAT_RULES = `FORMATAÇÃO OBRIGATÓRIA:
- PROIBIDO markdown: não use **, *, __, #, \`\`\` nem listas com hífen no início da linha
- Use texto limpo com parágrafos separados por linha em branco
- Para destaque use HTML simples: <b>, <i>, <p>, <ul>, <li> (em campos que aceitam HTML)
- Nunca deixe asteriscos soltos no texto final`

/** Instrução para materiais de apoio — HTML organizado, legível e com destaques visuais. */
export const AI_MATERIAL_FORMAT_RULES = `ORGANIZAÇÃO E FORMATAÇÃO DO MATERIAL (OBRIGATÓRIO):

Material de revisão estratégica: completo, objetivo e fácil de ler — sem apostolão.

ESTRUTURA HTML PERMITIDA:
- <p> — um parágrafo por ideia (NUNCA um bloco único gigante)
- <h4> — subtítulos (ex: "Conceito", "Na prática da banca", "Dica de memorização")
- <b> ou <strong> — termos-chave, artigos de lei
- <i> ou <em> — ênfase leve
- <mark> — grifar prazos, artigos e pegadinhas
- <ul><li> — listas curtas de requisitos/exceções

COMO ORGANIZAR CADA RESUMO (revisaoTurbo.conteudo):
1. <h4> + <p> com o conceito central
2. 2–4 parágrafos <p> de desenvolvimento (sem repetir a mesma ideia)
3. <mark> em 1–2 trechos críticos
4. <b> em termos técnicos essenciais
5. Feche com <h4>Dica de memorização</h4> + 1 <p> ou lista curta

EXEMPLO:
"<h4>Conceito central</h4><p>O <b>inquérito policial</b> é procedimento administrativo...</p><p><mark>Art. 4º do CPP</mark> — o inquérito é dispensável quando...</p><h4>Na prática da banca</h4><ul><li>Costuma cobrar prazos</li><li>Pede distinção entre...</li></ul><h4>Dica de memorização</h4><p>Lembre: <b>I</b>nquérito = <b>I</b>nvestigação inicial.</p>"

REGRAS:
- PROIBIDO markdown (** * __ #) — somente HTML
- 3–5 parágrafos <p> por resumo (não mais que isso)
- padraoBanca e gabaritoComentado: objetivos (parágrafos + <b>/<mark>)
- Cada <p> com 2–4 frases; sem parede de texto nem preenchimento vazio`
