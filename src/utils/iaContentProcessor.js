/**
 * Função auxiliar para adicionar aviso legal ao conteúdo IA
 */
const addLegalDisclaimer = (processedContent) => {
  const disclaimer = `
    <div class="aviso" style="margin-top: 2rem; padding: 1rem;">
      <p style="margin: 0; font-size: 0.875rem; line-height: 1.5;">
        <strong>⚠️ Aviso Importante:</strong> Consulte a legislação para estudar. Este conteúdo é gerado por I.A. e pode haver troca de artigos com pequenos erros, contudo isso não invalida o material. Ass: Sua I.A. do FlashConCards
      </p>
    </div>
  `
  
  return processedContent + disclaimer
}

/**
 * Função principal de processamento de conteúdo IA
 */
export const processIAContent = (htmlContent, contexto = null) => {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return htmlContent
  }

  let processedHtml = htmlContent

  // 1. Adicionar cabeçalho de contexto se disponível
  if (contexto) {
    processedHtml = addContextHeader(processedHtml, contexto)
  }

  // 2. Limpar e normalizar quebras de linha
  processedHtml = processedHtml
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n') // Limitar a 2 quebras de linha seguidas

  // 3. Converter quebras de linha em parágrafos quando apropriado
  processedHtml = convertLineBreaksToParagraphs(processedHtml)

  // 4. Melhorar tabelas - adicionar classes e estrutura
  processedHtml = enhanceTables(processedHtml)

  // 5. Melhorar listas - adicionar classes
  processedHtml = enhanceLists(processedHtml)

  // 6. Melhorar negrito - adicionar classes especiais
  processedHtml = enhanceBoldText(processedHtml)

  // 7. Adicionar estrutura semântica para títulos
  processedHtml = enhanceHeadings(processedHtml)

  // 8. Melhorar links
  processedHtml = enhanceLinks(processedHtml)

  // 9. Adicionar classes para conteúdo especial
  processedHtml = enhanceSpecialContent(processedHtml)

  // 10. Limpar tags vazias e espaços extras
  processedHtml = cleanupHtml(processedHtml)

  // 11. Adicionar aviso legal no final
  processedHtml = addLegalDisclaimer(processedHtml)

  return processedHtml
}

/**
 * Adiciona cabeçalho contextual com informações da disciplina
 */
const addContextHeader = (content, contexto) => {
  const { disciplina, topico, topicoNumero, curso } = contexto
  
  const header = `
    <div class="context-header" style="margin-bottom: 1.5rem; padding: 1rem; background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-left: 4px solid #0ea5e9; border-radius: 0 0.5rem 0.5rem 0;">
      <div style="display: flex; flex-direction: column; gap: 0.25rem;">
        <span style="font-size: 0.75rem; color: #0369a1; font-weight: 600;">📚 ${disciplina}</span>
        <span style="font-size: 0.875rem; color: #0c4a6e; font-weight: 700;">
          ${topicoNumero ? `${topicoNumero} - ` : ''}${topico}
        </span>
        <span style="font-size: 0.75rem; color: #075985;">🎯 ${curso}</span>
      </div>
    </div>
  `
  
  return header + content
}

/**
 * Converte quebras de linha em parágrafos quando apropriado
 */
const convertLineBreaksToParagraphs = (html) => {
  // Não processar se já tiver parágrafos
  if (html.includes('<p>')) return html

  // Dividir por quebras de linha duplas
  const paragraphs = html.split('\n\n').filter(p => p.trim())
  
  if (paragraphs.length <= 1) return html

  return paragraphs
    .map(p => {
      const trimmed = p.trim()
      // Se já for uma tag HTML, não envolver em <p>
      if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
        return trimmed
      }
      // Converter quebras de linha simples dentro do parágrafo para <br>
      const withBreaks = trimmed.replace(/\n/g, '<br>')
      return `<p>${withBreaks}</p>`
    })
    .join('\n\n')
}

/**
 * Melhora tabelas com classes e estrutura adequada
 */
const enhanceTables = (html) => {
  // Adicionar classes às tabelas
  html = html.replace(/<table([^>]*)>/gi, '<table$1>')
  
  // Garantir estrutura adequada da tabela
  if (html.includes('<table>') && !html.includes('<thead>')) {
    html = html.replace(
      /<table>(.*?)<tr>(.*?)<\/tr>(.*?)<\/table>/gis,
      (match, before, firstRow, after) => {
        const cells = firstRow.match(/<t[hd][^>]*>(.*?)<\/t[hd]>/gi) || []
        const headers = cells.map(cell => 
          cell.replace(/<t[hd]/, '<th').replace(/<\/t[hd]>/, '</th>')
        ).join('')
        
        return `<table>${before}<thead><tr>${headers}</tr></thead><tbody>${after}</tbody></table>`
      }
    )
  }

  return html
}

/**
 * Melhora listas com classes
 */
const enhanceLists = (html) => {
  // Listas não ordenadas
  html = html.replace(/<ul([^>]*)>/gi, '<ul$1>')
  
  // Listas ordenadas
  html = html.replace(/<ol([^>]*)>/gi, '<ol$1>')
  
  // Itens de lista
  html = html.replace(/<li([^>]*)>/gi, '<li$1>')

  return html
}

/**
 * Melhora texto em negrito
 */
const enhanceBoldText = (html) => {
  // Converter <b> para <strong> semanticamente melhor
  html = html.replace(/<b([^>]*)>/gi, '<strong$1>')
  html = html.replace(/<\/b>/gi, '</strong>')

  // Adicionar classes especiais para negrito importante
  html = html.replace(
    /<strong>(.*?)<\/strong>/gi,
    '<strong>$1</strong>'
  )

  return html
}

/**
 * Melhora estrutura de títulos
 */
const enhanceHeadings = (html) => {
  // Garantir que todos os títulos tenham estrutura semântica adequada
  const headingLevels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']
  
  headingLevels.forEach(level => {
    html = html.replace(new RegExp(`<${level}([^>]*)>`, 'gi'), `<${level}$1>`)
  })

  return html
}

/**
 * Melhora links com segurança e acessibilidade
 */
const enhanceLinks = (html) => {
  return html.replace(
    /<a([^>]*)>/gi,
    '<a$1 target="_blank" rel="noopener noreferrer">'
  )
}

/**
 * Adiciona classes para conteúdo especial
 */
const enhanceSpecialContent = (html) => {
  // Detectar e marcar notas, avisos e conteúdo importante
  const patterns = [
    { regex: /\b(nota|observação|obs\.?|note)\b[:\s]*([^.\n]+)/gi, class: 'nota' },
    { regex: /\b(atenção|aviso|cuidado|warning)\b[:\s]*([^.\n]+)/gi, class: 'aviso' },
    { regex: /\b(importante|essencial|crucial|important)\b[:\s]*([^.\n]+)/gi, class: 'importante' }
  ]

  patterns.forEach(({ regex, class: className }) => {
    html = html.replace(regex, `<div class="${className}">$1: $2</div>`)
  })

  // Detectar e formatar badges
  html = html.replace(
    /\[(novo|atualizado|urgente|opcional|obrigatório)\]/gi,
    '<span class="badge badge-$1">$1</span>'
  )

  return html
}

/**
 * Limpa HTML removendo tags vazias e espaços extras
 */
const cleanupHtml = (html) => {
  // Remover tags vazias
  html = html.replace(/<[^>]*>\s*<\/[^>]*>/g, '')
  
  // Remover espaços extras no início e fim das tags
  html = html.replace(/>\s+</g, '><')
  
  // Normalizar espaços
  html = html.replace(/\s{2,}/g, ' ')

  return html.trim()
}

/**
 * Função auxiliar para detectar se o conteúdo parece ser HTML
 */
export const isHtmlContent = (content) => {
  if (!content || typeof content !== 'string') return false
  
  // Verificar por tags HTML básicas
  const htmlTags = /<[^>]+>/gi
  const hasHtmlTags = htmlTags.test(content)
  
  // Verificar se não é apenas texto com < e > (como em código ou fórmulas)
  const suspiciousPatterns = /[<>]=|&lt;|&gt;|if\s*\(|for\s*\(/gi
  
  return hasHtmlTags && !suspiciousPatterns.test(content)
}

/**
 * Função para extrair texto puro do HTML (para áudio, etc.)
 */
export const extractTextFromHtml = (html) => {
  if (!html) return ''
  
  return html
    .replace(/<script[^>]*>.*?<\/script>/gis, '')
    .replace(/<style[^>]*>.*?<\/style>/gis, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Função para pré-visualizar o conteúdo processado
 */
export const previewProcessedContent = (content, maxLength = 200) => {
  const processed = processIAContent(content)
  const textOnly = extractTextFromHtml(processed)
  
  if (textOnly.length <= maxLength) return textOnly
  
  return textOnly.substring(0, maxLength) + '...'
}
