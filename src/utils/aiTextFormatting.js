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

COMO ORGANIZAR CADA RESUMO (revisaoTurbo.conteudo) — 6 SEÇÕES OBRIGATÓRIAS:
1. <h4>Conceito central</h4> — definição precisa + elementos/requisitos
2. <h4>Base normativa</h4> — artigo/lei/súmula essenciais (só se for real)
3. <h4>Distinções e exceções</h4> — fronteiras do instituto; o que NÃO se aplica
4. <h4>Na prática da banca</h4> — como ESTA banca cobra ESTE ponto no cargo (específico)
5. <h4>Margens de dúvida</h4> — 2–4 itens no formato <b>Dúvida:</b> … <b>Resposta:</b> …
6. <h4>Dica de memorização</h4>

PROIBIDO: texto genérico ("é importante saber", "a banca cobra o tema") sem substância.
OBRIGATÓRIO: fechar dúvidas — regra + exceção + o que não se aplica.

PADRÃO DA BANCA (raioXProbabilidade.padraoBanca) — OBRIGATÓRIO E DETALHADO:
1. <h4>Como a banca cobra</h4>
2. <h4>O que mais cai</h4> + lista
3. <h4>Pegadinhas recorrentes</h4> + lista
4. <h4>Exemplo típico de cobrança</h4>
5. <h4>O que costuma NÃO cair</h4>

EXEMPLO DE RESUMO:
"<h4>Conceito central</h4><p>O <b>inquérito policial</b> é procedimento administrativo...</p><h4>Base normativa</h4><p><mark>Art. 4º do CPP</mark>...</p><h4>Distinções e exceções</h4><ul><li>Não se confunde com...</li></ul><h4>Na prática da banca</h4><p>A banca costuma cobrar prazos e a dispensabilidade...</p><h4>Margens de dúvida</h4><ul><li><b>Dúvida:</b> O inquérito é indispensável? <b>Resposta:</b> Não, quando...</li></ul><h4>Dica de memorização</h4><p>Lembre: <b>I</b>nquérito = <b>I</b>nvestigação inicial.</p>"

REGRAS:
- PROIBIDO markdown (** * __ #) — somente HTML
- Cada resumo: ~280–420 palavras, com as 6 seções
- padraoBanca: 140–240 palavras, específico da banca/cargo
- OBRIGATÓRIO: revisaoTurbo com no mínimo 6 itens {titulo, conteudo}
- OBRIGATÓRIO: cada resumo com "Na prática da banca" + "Margens de dúvida"`
