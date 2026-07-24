import { stripHtml } from './htmlTextHelpers'

/**
 * Monta um roteiro de leitura do material gerado (sem HTML).
 */
export function buildMaterialSpeechScript(conteudo = {}, { courseName = '' } = {}) {
  if (!conteudo || typeof conteudo !== 'object') return ''

  const parts = []
  const title = conteudo.materia || conteudo.titulo || ''
  if (title) parts.push(title)
  if (conteudo.subtitulo) parts.push(stripHtml(conteudo.subtitulo))

  const raio = conteudo.raioXProbabilidade
  if (raio) {
    parts.push('Raio-X de Probabilidade.')
    if (Array.isArray(raio.topicosQuentes) && raio.topicosQuentes.length) {
      parts.push('Top assuntos quentes:')
      raio.topicosQuentes.forEach((item, idx) => {
        parts.push(`${idx + 1}. ${stripHtml(String(item))}`)
      })
    }
    if (raio.padraoBanca) {
      parts.push('O padrão da banca.')
      parts.push(stripHtml(raio.padraoBanca))
    }
  }

  if (Array.isArray(conteudo.revisaoTurbo) && conteudo.revisaoTurbo.length) {
    parts.push('Revisão Turbo.')
    conteudo.revisaoTurbo.forEach((item) => {
      if (item?.titulo) parts.push(stripHtml(item.titulo))
      if (item?.conteudo) parts.push(stripHtml(item.conteudo))
    })
  }

  if (Array.isArray(conteudo.pegadinhas) && conteudo.pegadinhas.length) {
    parts.push('Cuidado com as pegadinhas.')
    conteudo.pegadinhas.forEach((item) => {
      if (item?.titulo) parts.push(stripHtml(item.titulo))
      if (item?.conteudo) parts.push(stripHtml(item.conteudo))
    })
  }

  if (Array.isArray(conteudo.questoesPreditivas) && conteudo.questoesPreditivas.length) {
    parts.push('Questões preditivas.')
    conteudo.questoesPreditivas.forEach((q, idx) => {
      parts.push(`Questão ${idx + 1}.`)
      if (q?.enunciado) parts.push(stripHtml(q.enunciado))
      if (Array.isArray(q?.alternativas)) {
        q.alternativas.forEach((alt, aIdx) => {
          const letter = String.fromCharCode(65 + aIdx)
          parts.push(`Alternativa ${letter}: ${stripHtml(String(alt))}`)
        })
      }
      if (q?.gabaritoComentado) {
        parts.push('Gabarito comentado.')
        parts.push(stripHtml(q.gabaritoComentado))
      }
    })
  }

  // Legado
  if (conteudo.content) parts.push(stripHtml(conteudo.content))
  if (Array.isArray(conteudo.secoes)) {
    conteudo.secoes.forEach((secao) => {
      if (secao?.titulo) parts.push(stripHtml(secao.titulo))
      if (secao?.conteudo) parts.push(stripHtml(secao.conteudo))
      if (secao?.texto) parts.push(stripHtml(secao.texto))
    })
  }

  let script = parts.filter(Boolean).join('\n\n')
  if (courseName) {
    script = script.replace(/\bconcurso\b/gi, courseName)
  }
  return script.trim()
}

/**
 * Extrato do material gerado para ancorar flashcards (fonte da verdade do tópico).
 * Remove ruído de leitura e limita tamanho para caber no prompt.
 */
export function buildFlashcardMaterialAnchor(conteudo = {}, { maxChars = 14000 } = {}) {
  if (!conteudo || typeof conteudo !== 'object') return ''

  const chunks = []
  const title = conteudo.materia || conteudo.titulo || ''
  if (title) chunks.push(`TÍTULO: ${stripHtml(String(title))}`)
  if (conteudo.validacaoArtigo) {
    chunks.push(`BASE NORMATIVA: ${stripHtml(String(conteudo.validacaoArtigo))}`)
  }

  const raio = conteudo.raioXProbabilidade
  if (raio?.padraoBanca) {
    chunks.push(`PADRÃO DA BANCA:\n${stripHtml(String(raio.padraoBanca))}`)
  }
  if (Array.isArray(raio?.topicosQuentes) && raio.topicosQuentes.length) {
    chunks.push(
      `ASSUNTOS QUENTES:\n${raio.topicosQuentes
        .map((item, i) => `${i + 1}. ${stripHtml(String(item))}`)
        .join('\n')}`,
    )
  }

  const turbo = Array.isArray(conteudo.revisaoTurbo) ? conteudo.revisaoTurbo : []
  if (turbo.length) {
    const turboText = turbo
      .map((item, i) => {
        const t = stripHtml(String(item?.titulo || `Assunto ${i + 1}`))
        const c = stripHtml(String(item?.conteudo || ''))
        return `### ${t}\n${c}`
      })
      .join('\n\n')
    chunks.push(`REVISÃO TURBO (núcleo factual):\n${turboText}`)
  }

  if (Array.isArray(conteudo.pegadinhas) && conteudo.pegadinhas.length) {
    const peg = conteudo.pegadinhas
      .map((item) => {
        const t = stripHtml(String(item?.titulo || 'Pegadinha'))
        const c = stripHtml(String(item?.conteudo || ''))
        return `- ${t}: ${c}`
      })
      .join('\n')
    chunks.push(`PEGADINHAS:\n${peg}`)
  }

  // Legado / fallback
  if (!turbo.length && conteudo.content) {
    chunks.push(`CONTEÚDO:\n${stripHtml(String(conteudo.content))}`)
  }

  let text = chunks.filter(Boolean).join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!text) return ''
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars)}\n\n[… material truncado — use só o trecho acima como base]`
  }

  return `═══ MATERIAL DO TÓPICO (FONTE DA VERDADE — OBRIGATÓRIO) ═══
Os flashcards DEVEM ser extraídos e alinhados a este material.
NÃO invente fato que não esteja aqui (salvo confirmação legal inequívoca via busca).
NÃO contradiga prazos, artigos, conceitos, exceções ou gabaritos deste material.

${text}

═══ FIM DO MATERIAL ═══`
}
