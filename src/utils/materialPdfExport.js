import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

const A4_WIDTH_PX = 794
const PDF_MARGIN_MM = 12
const CAPTURE_SCALE = 2

const PDF_BASE_STYLES = `
  * { box-sizing: border-box; }
  .material-pdf-root {
    width: 100%;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #1e293b;
    background: #ffffff;
  }
  .material-pdf-root h1 {
    font-size: 22pt;
    font-weight: 800;
    color: #065f46;
    margin: 0 0 8px;
    line-height: 1.25;
  }
  .material-pdf-root .pdf-meta {
    font-size: 10pt;
    color: #64748b;
    margin-bottom: 20px;
  }
  .material-pdf-root .pdf-banner {
    background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
    border: 1px solid #a7f3d0;
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 22px;
    font-size: 10.5pt;
    color: #14532d;
  }
  .material-pdf-root h2 {
    font-size: 15pt;
    font-weight: 700;
    color: #0f766e;
    margin: 22px 0 10px;
    padding-bottom: 6px;
    border-bottom: 2px solid #99f6e4;
    page-break-after: avoid;
  }
  .material-pdf-root h3 {
    font-size: 12.5pt;
    font-weight: 700;
    color: #134e4a;
    margin: 16px 0 8px;
    page-break-after: avoid;
  }
  .material-pdf-root p { margin: 0 0 10px; }
  .material-pdf-root ul, .material-pdf-root ol {
    margin: 0 0 12px 20px;
    padding: 0;
  }
  .material-pdf-root li { margin-bottom: 6px; }
  .material-pdf-root .pdf-section {
    margin-bottom: 18px;
    page-break-inside: avoid;
  }
  .material-pdf-root .pdf-pegadinha {
    background: #fff1f2;
    border: 1px solid #fecdd3;
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 14px;
    page-break-inside: avoid;
  }
  .material-pdf-root .pdf-pegadinha h3 { color: #be123c; margin-top: 0; }
  .material-pdf-root .pdf-questao {
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 14px;
    background: #f8fafc;
    page-break-inside: avoid;
  }
  .material-pdf-root .pdf-questao .enunciado {
    font-weight: 600;
    margin-bottom: 10px;
  }
  .material-pdf-root .pdf-gabarito {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px dashed #cbd5e1;
    font-size: 10pt;
  }
  .material-pdf-root b, .material-pdf-root strong { font-weight: 700; }
`

function sanitizeFilename(name = 'material') {
  return (
    String(name)
      .replace(/[^a-zA-Z0-9\-_.\s]/g, '_')
      .replace(/\s+/g, '-')
      .slice(0, 120) || 'material'
  )
}

function normalizeCloneForExport(node) {
  if (!(node instanceof HTMLElement)) return

  node.style.maxHeight = 'none'
  node.style.height = 'auto'
  node.style.overflow = 'visible'
  node.style.overflowY = 'visible'
  node.style.wordBreak = 'break-word'
  node.style.overflowWrap = 'break-word'

  const tag = node.tagName.toLowerCase()
  if (['script', 'style', 'svg'].includes(tag)) {
    node.style.display = 'none'
    return
  }
  if (node.closest('[data-pdf-ignore]') || node.hasAttribute('data-pdf-ignore')) {
    node.style.display = 'none'
    return
  }

  const computed = window.getComputedStyle(node)
  const color = computed.color
  if (color && (color.includes('250') || color.includes('255, 255') || color.includes('248, 250'))) {
    node.style.setProperty('color', '#1e293b', 'important')
  }
  const bg = computed.backgroundColor
  if (bg && (bg.includes('24, 24') || bg.includes('39, 39') || bg.includes('9, 9') || bg.includes('15, 23'))) {
    node.style.setProperty('background-color', '#ffffff', 'important')
  }

  Array.from(node.children).forEach(normalizeCloneForExport)
}

function getExportBlocks(root) {
  const pdfRoot = root.classList?.contains('material-pdf-root')
    ? root
    : root.querySelector('.material-pdf-root') || root

  const blocks = Array.from(pdfRoot.children).filter(
    (child) =>
      child instanceof HTMLElement &&
      !['style', 'script'].includes(child.tagName.toLowerCase()) &&
      child.textContent?.trim(),
  )

  return blocks.length > 0 ? blocks : [pdfRoot]
}

function sliceCanvasToPages(canvas, contentWidthMm, contentHeightMm) {
  const pageHeightPx = Math.floor((contentHeightMm * canvas.width) / contentWidthMm)
  const pages = []
  let yOffset = 0

  while (yOffset < canvas.height) {
    const sliceHeight = Math.min(pageHeightPx, canvas.height - yOffset)
    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = canvas.width
    pageCanvas.height = sliceHeight

    const ctx = pageCanvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    ctx.drawImage(canvas, 0, yOffset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)

    pages.push({
      dataUrl: pageCanvas.toDataURL('image/png'),
      heightMm: (sliceHeight * contentWidthMm) / canvas.width,
    })

    yOffset += sliceHeight
  }

  return pages
}

async function renderBlockToCanvas(block, widthPx) {
  const wrapper = document.createElement('div')
  wrapper.style.position = 'fixed'
  wrapper.style.left = '-20000px'
  wrapper.style.top = '0'
  wrapper.style.width = `${widthPx}px`
  wrapper.style.maxWidth = `${widthPx}px`
  wrapper.style.background = '#ffffff'
  wrapper.style.padding = '0'
  wrapper.style.overflow = 'visible'

  const styleEl = document.createElement('style')
  styleEl.textContent = PDF_BASE_STYLES
  wrapper.appendChild(styleEl)

  const clone = block.cloneNode(true)
  normalizeCloneForExport(clone)
  wrapper.appendChild(clone)
  document.body.appendChild(wrapper)

  try {
    const height = Math.max(wrapper.scrollHeight, wrapper.offsetHeight, clone.scrollHeight)
    return await html2canvas(wrapper, {
      backgroundColor: '#ffffff',
      scale: CAPTURE_SCALE,
      useCORS: true,
      logging: false,
      width: widthPx,
      windowWidth: widthPx,
      height,
      windowHeight: height,
      scrollY: 0,
      scrollX: 0,
    })
  } finally {
    document.body.removeChild(wrapper)
  }
}

async function appendCanvasToPdf(pdf, canvas, contentWidthMm, contentHeightMm, pageState) {
  const pages = sliceCanvasToPages(canvas, contentWidthMm, contentHeightMm)

  pages.forEach((page) => {
    if (pageState.started) pdf.addPage()
    else pageState.started = true

    pdf.addImage(
      page.dataUrl,
      'PNG',
      PDF_MARGIN_MM,
      PDF_MARGIN_MM,
      contentWidthMm,
      page.heightMm,
    )
  })
}

/** Monta HTML formatado para material de concurso (exportação completa). */
export function buildConcursoMaterialPdfHtml(material = {}) {
  const topicos = (material.raioXProbabilidade?.topicosQuentes || [])
    .map((t) => `<li>${t}</li>`)
    .join('')

  const revisoes = (material.revisaoTurbo || [])
    .map(
      (item) => `
      <div class="pdf-section">
        <h3>${item.titulo || 'Revisão'}</h3>
        <div>${item.conteudo || ''}</div>
      </div>`,
    )
    .join('')

  const pegadinhas = (material.pegadinhas || [])
    .map(
      (item) => `
      <div class="pdf-pegadinha">
        <h3>${item.titulo || 'Cuidado, caçapa!'}</h3>
        <div>${item.conteudo || ''}</div>
      </div>`,
    )
    .join('')

  const questoes = (material.questoesPreditivas || [])
    .map((q, idx) => {
      const alternativas = Object.entries(q.alternativas || {})
        .map(([letter, text]) => `<li><strong>${letter})</strong> ${text}</li>`)
        .join('')
      return `
      <div class="pdf-questao">
        <p class="enunciado">${idx + 1}. ${q.enunciado || ''}</p>
        <ul>${alternativas}</ul>
        <div class="pdf-gabarito"><strong>Gabarito ${q.correta || ''}:</strong> ${q.gabaritoComentado || ''}</div>
      </div>`
    })
    .join('')

  const revisaoHeader = revisoes
    ? '<h2>Revisão Turbo</h2>'
    : ''

  const pegadinhasHeader = pegadinhas
    ? '<h2>Cuidado, Caçapa!</h2>'
    : ''

  const questoesHeader = questoes
    ? '<h2>Questões Preditivas</h2>'
    : ''

  const dificuldade = material.analiseDificuldade?.justificativa
    ? `<div class="pdf-banner"><strong>Análise de dificuldade (${material.analiseDificuldade.nivelDificuldade || '—'}):</strong> ${material.analiseDificuldade.justificativa}</div>`
    : ''

  return `
    <div class="material-pdf-root">
      <header class="pdf-section">
        <h1>${material.titulo || `${material.concurso || 'Material'} — ${material.cargo || ''}`}</h1>
        <p class="pdf-meta">${material.concurso || ''} · ${material.cargo || ''} · Banca ${material.banca || ''}</p>
        ${dificuldade}
      </header>

      ${
        material.raioXProbabilidade
          ? `<section class="pdf-section">
        <h2>Raio-X de Probabilidade</h2>
        <ul>${topicos}</ul>
        ${material.raioXProbabilidade.padraoBanca ? `<p>${material.raioXProbabilidade.padraoBanca}</p>` : ''}
      </section>`
          : ''
      }

      ${revisaoHeader}
      ${revisoes}

      ${pegadinhasHeader}
      ${pegadinhas}

      ${questoesHeader}
      ${questoes}
    </div>
  `
}

/** Gera PDF do material de concurso a partir dos dados (conteúdo completo, formatado). */
export async function downloadConcursoMaterialPdf(material, filename = 'material.pdf') {
  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.left = '-20000px'
  host.style.top = '0'
  host.style.width = `${A4_WIDTH_PX}px`
  host.style.background = '#ffffff'
  host.innerHTML = buildConcursoMaterialPdfHtml(material)
  document.body.appendChild(host)

  try {
    const root = host.querySelector('.material-pdf-root') || host
    await downloadElementAsPdf(root, filename)
  } finally {
    document.body.removeChild(host)
  }
}

/** Gera PDF a partir do HTML renderizado — captura bloco a bloco para não perder conteúdo. */
export async function downloadElementAsPdf(element, filename = 'material.pdf') {
  if (!element) {
    throw new Error('Conteúdo não encontrado para exportar.')
  }

  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const contentWidthMm = pageWidth - PDF_MARGIN_MM * 2
  const contentHeightMm = pageHeight - PDF_MARGIN_MM * 2
  const pageState = { started: false }

  const blocks = getExportBlocks(element)

  for (const block of blocks) {
    const canvas = await renderBlockToCanvas(block, A4_WIDTH_PX)
    await appendCanvasToPdf(pdf, canvas, contentWidthMm, contentHeightMm, pageState)
  }

  if (!pageState.started) {
    const canvas = await renderBlockToCanvas(element, A4_WIDTH_PX)
    await appendCanvasToPdf(pdf, canvas, contentWidthMm, contentHeightMm, pageState)
  }

  pdf.save(sanitizeFilename(filename.replace(/\.pdf$/i, '')) + '.pdf')
}
