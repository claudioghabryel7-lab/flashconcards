/**
 * Renderizador de Mapa Mental estilo NotebookLM
 * Layout horizontal: nó central à esquerda, nós secundários empilhados à direita
 * Visual idêntico ao NotebookLM
 */

// Cores exatas estilo NotebookLM
const COLORS = {
  central: {
    bg: '#E8E0F5', // Roxo claro exato
    border: '#9B7EDE',
    text: '#5B2C91'
  },
  secondary: {
    bg: '#E3F2FD', // Azul claro exato
    border: '#64B5F6',
    text: '#1565C0'
  },
  line: '#9B7EDE', // Linha roxa
  background: '#FFFFFF',
  expandIcon: '#757575', // Cinza para o ícone >
  title: '#1A1A1A',
  subtitle: '#666666',
  disclaimer: '#999999'
}

// Quebrar texto em múltiplas linhas
const wrapText = (ctx, text, maxWidth, fontSize) => {
  ctx.font = `${fontSize}px 'Google Sans', 'Segoe UI', 'Roboto', Arial, sans-serif`
  const words = text.split(' ')
  const lines = []
  let currentLine = ''
  
  words.forEach((word) => {
    const testLine = currentLine + (currentLine ? ' ' : '') + word
    const metrics = ctx.measureText(testLine)
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  })
  if (currentLine) lines.push(currentLine)
  return lines
}

// Desenhar retângulo arredondado com sombra melhorada
const drawRoundedRect = (ctx, x, y, width, height, radius, fillColor, borderColor, borderWidth = 2) => {
  ctx.save()
  
  // Sombra mais sutil e realista
  ctx.shadowColor = 'rgba(0, 0, 0, 0.08)'
  ctx.shadowBlur = 12
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 3
  
  // Fundo
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
  
  ctx.fillStyle = fillColor
  ctx.fill()
  
  // Resetar sombra para a borda
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  
  // Borda mais suave
  ctx.strokeStyle = borderColor
  ctx.lineWidth = borderWidth
  ctx.stroke()
  
  ctx.restore()
}

// Desenhar linha curva suave conectando dois nós
const drawCurvedLine = (ctx, x1, y1, x2, y2, color, lineWidth = 4) => {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  
  // Curva mais suave estilo NotebookLM
  const midX = (x1 + x2) / 2
  const controlY1 = y1
  const controlY2 = y2
  
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.bezierCurveTo(midX, controlY1, midX, controlY2, x2, y2)
  ctx.stroke()
  
  ctx.restore()
}

// Desenhar nó (retângulo com texto) - estilo NotebookLM exato
const drawNode = (ctx, x, y, width, height, text, colors, isCentral = false, showExpandIcon = false) => {
  const radius = 12 // Raio menor, mais elegante
  
  // Desenhar retângulo
  drawRoundedRect(
    ctx,
    x,
    y,
    width,
    height,
    radius,
    colors.bg,
    colors.border,
    isCentral ? 2.5 : 2
  )
  
  // Texto
  const padding = 24
  const maxTextWidth = width - (padding * 2) - (showExpandIcon ? 35 : 0)
  const fontSize = isCentral ? 26 : 20
  const fontWeight = isCentral ? 'bold' : '600'
  
  ctx.font = `${fontWeight} ${fontSize}px 'Google Sans', 'Segoe UI', 'Roboto', Arial, sans-serif`
  ctx.fillStyle = colors.text
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  
  const lines = wrapText(ctx, text, maxTextWidth, fontSize)
  const lineHeight = fontSize * 1.4
  const totalTextHeight = lines.length * lineHeight
  const startY = y + (height / 2) - (totalTextHeight / 2) + (lineHeight / 2)
  
  lines.forEach((line, idx) => {
    ctx.fillText(line, x + padding, startY + (idx * lineHeight) - (lineHeight / 2))
  })
  
  // Ícone de expansão (se solicitado) - estilo NotebookLM
  if (showExpandIcon) {
    ctx.fillStyle = COLORS.expandIcon
    ctx.font = 'bold 18px Arial'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText('>', x + width - 18, y + height / 2)
  }
}

/**
 * Renderizar mapa mental estilo NotebookLM
 */
export const renderNotebookLMMindMap = (canvas, flashcards, materia, modulo, courseName) => {
  if (!canvas || !flashcards || flashcards.length === 0) {
    console.error('❌ Dados inválidos para renderizar mapa mental')
    return null
  }
  
  console.log(`🎨 Renderizando mapa mental estilo NotebookLM com ${flashcards.length} flashcards`)
  
  const ctx = canvas.getContext('2d')
  
  // Dimensões (alta resolução para download)
  canvas.width = 4000
  canvas.height = 3000
  
  // Limpar
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  
  // Fundo branco puro
  ctx.fillStyle = COLORS.background
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  
  // Organizar flashcards em temas
  const themes = organizeFlashcardsByThemes(flashcards)
  const maxThemes = 6 // Máximo 6 temas como no NotebookLM
  
  // Título principal (topo) - estilo NotebookLM
  const title = modulo || materia || 'Mapa Mental'
  const titleY = 100
  ctx.fillStyle = COLORS.title
  ctx.font = 'bold 64px "Google Sans", "Segoe UI", "Roboto", Arial, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(title, 120, titleY)
  
  // Subtítulo
  ctx.fillStyle = COLORS.subtitle
  ctx.font = '400 28px "Google Sans", "Segoe UI", "Roboto", Arial, sans-serif'
  ctx.fillText(`Com base em ${flashcards.length} flashcards`, 120, titleY + 70)
  
  // Área do mapa mental (começar mais abaixo)
  const mapStartY = titleY + 140
  const centralNodeX = 200
  const centralNodeY = mapStartY + 180
  const centralNodeWidth = 480
  const centralNodeHeight = 140
  
  // Nó central (à esquerda) - título em CAIXA ALTA
  const centralText = (materia || 'TÓPICO PRINCIPAL').toUpperCase()
  drawNode(
    ctx,
    centralNodeX,
    centralNodeY,
    centralNodeWidth,
    centralNodeHeight,
    centralText,
    COLORS.central,
    true,
    false
  )
  
  // Posição dos nós secundários (à direita)
  const secondaryStartX = centralNodeX + centralNodeWidth + 180
  const secondaryWidth = 520
  const secondaryHeight = 100
  const secondarySpacing = 16
  
  // Calcular altura total necessária e centralizar verticalmente
  const totalSecondaryHeight = (Math.min(themes.length, maxThemes) * (secondaryHeight + secondarySpacing)) - secondarySpacing
  const firstSecondaryY = centralNodeY + (centralNodeHeight / 2) - (totalSecondaryHeight / 2)
  
  // Desenhar nós secundários
  themes.slice(0, maxThemes).forEach((theme, idx) => {
    const secondaryY = firstSecondaryY + (idx * (secondaryHeight + secondarySpacing))
    
    // Linha curva conectando o nó central ao secundário
    const lineStartX = centralNodeX + centralNodeWidth
    const lineStartY = centralNodeY + (centralNodeHeight / 2)
    const lineEndX = secondaryStartX
    const lineEndY = secondaryY + (secondaryHeight / 2)
    
    drawCurvedLine(ctx, lineStartX, lineStartY, lineEndX, lineEndY, COLORS.line, 4.5)
    
    // Nó secundário - título em CAIXA ALTA
    let themeTitle = theme.name
    if (themeTitle.length > 60) {
      themeTitle = themeTitle.substring(0, 57) + '...'
    }
    drawNode(
      ctx,
      secondaryStartX,
      secondaryY,
      secondaryWidth,
      secondaryHeight,
      themeTitle.toUpperCase(),
      COLORS.secondary,
      false,
      true // Mostrar ícone >
    )
  })
  
  // Botões de feedback (canto inferior esquerdo) - estilo NotebookLM
  const feedbackY = canvas.height - 120
  const feedbackX = 120
  
  // Botão "Conteúdo bom"
  drawRoundedRect(ctx, feedbackX, feedbackY, 200, 56, 28, '#F5F5F5', '#E0E0E0', 1)
  ctx.fillStyle = '#333333'
  ctx.font = '500 20px "Google Sans", "Segoe UI", Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('👍 Conteúdo bom', feedbackX + 100, feedbackY + 28)
  
  // Botão "Conteúdo ruim"
  drawRoundedRect(ctx, feedbackX + 220, feedbackY, 200, 56, 28, '#F5F5F5', '#E0E0E0', 1)
  ctx.fillText('👎 Conteúdo ruim', feedbackX + 320, feedbackY + 28)
  
  // Controles de zoom (canto inferior direito) - estilo NotebookLM
  const controlsX = canvas.width - 160
  const controlsY = canvas.height - 240
  const controlSize = 56
  const controlSpacing = 12
  
  // Seta para cima
  drawRoundedRect(ctx, controlsX, controlsY, controlSize, controlSize, 8, '#F5F5F5', '#E0E0E0', 1)
  ctx.fillStyle = '#666666'
  ctx.font = 'bold 28px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('↑', controlsX + controlSize / 2, controlsY + controlSize / 2)
  
  // Botão +
  drawRoundedRect(ctx, controlsX, controlsY + controlSize + controlSpacing, controlSize, controlSize, 8, '#F5F5F5', '#E0E0E0', 1)
  ctx.fillText('+', controlsX + controlSize / 2, controlsY + controlSize + controlSpacing + controlSize / 2)
  
  // Botão -
  drawRoundedRect(ctx, controlsX, controlsY + (controlSize + controlSpacing) * 2, controlSize, controlSize, 8, '#F5F5F5', '#E0E0E0', 1)
  ctx.fillText('−', controlsX + controlSize / 2, controlsY + (controlSize + controlSpacing) * 2 + controlSize / 2)
  
  // Seta para baixo
  drawRoundedRect(ctx, controlsX, controlsY + (controlSize + controlSpacing) * 3, controlSize, controlSize, 8, '#F5F5F5', '#E0E0E0', 1)
  ctx.fillText('↓', controlsX + controlSize / 2, controlsY + (controlSize + controlSpacing) * 3 + controlSize / 2)
  
  // Disclaimer (rodapé) - estilo NotebookLM
  ctx.fillStyle = COLORS.disclaimer
  ctx.font = '400 18px "Google Sans", "Segoe UI", Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText('O NotebookLM pode gerar respostas incorretas. Por isso, cheque o conteúdo.', canvas.width / 2, canvas.height - 40)
  
  // Marca d'água (canto inferior direito, discreto)
  ctx.fillStyle = 'rgba(100, 116, 139, 0.35)'
  ctx.font = '500 22px "Google Sans", Arial, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(`${courseName} | FlashConCards`, canvas.width - 40, canvas.height - 40)
  
  return canvas.toDataURL('image/png')
}

/**
 * Organizar flashcards em temas usando análise inteligente
 */
function organizeFlashcardsByThemes(flashcards) {
  const themes = []
  const themeMap = new Map()
  
  flashcards.forEach((card) => {
    const question = String(card.pergunta || card.front || '').trim()
    const answer = String(card.resposta || card.back || '').trim()
    
    if (!question && !answer) return
    
    // Extrair palavras-chave mais inteligentes
    // Pegar palavras significativas (mais de 4 caracteres, não artigos/preposições)
    const stopWords = ['qual', 'como', 'quando', 'onde', 'porque', 'para', 'com', 'sem', 'sobre', 'sobre', 'entre']
    const words = question
      .split(' ')
      .filter(w => w.length > 4 && !stopWords.includes(w.toLowerCase()))
      .slice(0, 4)
    
    const themeKey = words.join(' ').substring(0, 45) || 'Conceitos Gerais'
    
    // Criar ou usar tema existente
    if (!themeMap.has(themeKey)) {
      themeMap.set(themeKey, {
        name: themeKey,
        cards: []
      })
    }
    
    themeMap.get(themeKey).cards.push(card)
  })
  
  // Converter para array e ordenar por número de cards
  themes.push(...Array.from(themeMap.values()))
  themes.sort((a, b) => b.cards.length - a.cards.length)
  
  // Se tiver muitos temas, agrupar os menores
  if (themes.length > 6) {
    const mainThemes = themes.slice(0, 5)
    const otherCards = themes.slice(5).flatMap(t => t.cards)
    
    if (otherCards.length > 0) {
      mainThemes.push({
        name: 'Outros Tópicos',
        cards: otherCards
      })
    }
    
    return mainThemes
  }
  
  return themes
}
