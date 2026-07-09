import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

const PDF_MARGIN_MM = 15
const A4_WIDTH_PX = 794

function sanitizeFilename(name = 'material') {
  return (
    String(name)
      .replace(/[^a-zA-Z0-9\-_.\s]/g, '_')
      .replace(/\s+/g, '-')
      .slice(0, 120) || 'material'
  )
}

function stripHtml(html = '') {
  const div = document.createElement('div')
  div.innerHTML = String(html)
  return (div.textContent || div.innerText || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizePlainText(text = '') {
  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Escritor de PDF leve (texto puro — arquivo pequeno e download rápido). */
class TextPdfWriter {
  constructor() {
    this.doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
    this.margin = PDF_MARGIN_MM
    this.pageWidth = this.doc.internal.pageSize.getWidth()
    this.pageHeight = this.doc.internal.pageSize.getHeight()
    this.maxWidth = this.pageWidth - this.margin * 2
    this.y = this.margin
  }

  ensureSpace(heightMm) {
    if (this.y + heightMm > this.pageHeight - this.margin) {
      this.doc.addPage()
      this.y = this.margin
    }
  }

  writeLines(lines, { fontSize = 10, fontStyle = 'normal', lineHeight = 5.2, gapAfter = 3 } = {}) {
    if (!lines.length) return
    this.doc.setFont('helvetica', fontStyle)
    this.doc.setFontSize(fontSize)
    const blockHeight = lines.length * lineHeight
    this.ensureSpace(blockHeight)
    this.doc.text(lines, this.margin, this.y)
    this.y += blockHeight + gapAfter
  }

  writeParagraph(text, options = {}) {
    const content = normalizePlainText(stripHtml(text))
    if (!content) return
    const lines = this.doc.splitTextToSize(content, this.maxWidth)
    this.writeLines(lines, options)
  }

  writeTitle(text) {
    const lines = this.doc.splitTextToSize(normalizePlainText(text), this.maxWidth)
    this.writeLines(lines, { fontSize: 17, fontStyle: 'bold', lineHeight: 7, gapAfter: 4 })
  }

  writeMeta(text) {
    const lines = this.doc.splitTextToSize(normalizePlainText(text), this.maxWidth)
    this.writeLines(lines, { fontSize: 10, fontStyle: 'normal', lineHeight: 5, gapAfter: 6 })
  }

  writeHeading(text) {
    this.y += 2
    const lines = this.doc.splitTextToSize(normalizePlainText(text), this.maxWidth)
    this.writeLines(lines, { fontSize: 13, fontStyle: 'bold', lineHeight: 6, gapAfter: 3 })
    this.doc.setDrawColor(16, 185, 129)
    this.doc.setLineWidth(0.4)
    this.doc.line(this.margin, this.y - 1, this.pageWidth - this.margin, this.y - 1)
    this.y += 2
  }

  writeSubheading(text) {
    const lines = this.doc.splitTextToSize(normalizePlainText(text), this.maxWidth)
    this.writeLines(lines, { fontSize: 11, fontStyle: 'bold', lineHeight: 5.5, gapAfter: 2 })
  }

  writeBulletList(items = []) {
    items.forEach((item) => {
      const lines = this.doc.splitTextToSize(`• ${normalizePlainText(item)}`, this.maxWidth - 4)
      this.writeLines(lines, { fontSize: 10, lineHeight: 5, gapAfter: 1.5 })
    })
    this.y += 2
  }

  save(filename) {
    this.doc.save(sanitizeFilename(filename.replace(/\.pdf$/i, '')) + '.pdf')
  }
}

function buildConcursoMaterialPlainDocument(material = {}) {
  const writer = new TextPdfWriter()

  writer.writeTitle(material.titulo || `${material.concurso || 'Material'} — ${material.cargo || ''}`)
  writer.writeMeta(`${material.concurso || ''} · ${material.cargo || ''} · Banca ${material.banca || ''}`)

  if (material.analiseDificuldade?.justificativa) {
    writer.writeParagraph(
      `Análise de dificuldade (${material.analiseDificuldade.nivelDificuldade || '—'}): ${material.analiseDificuldade.justificativa}`,
      { fontSize: 10, fontStyle: 'italic', gapAfter: 5 },
    )
  }

  if (material.raioXProbabilidade) {
    writer.writeHeading('Raio-X de Probabilidade')
    writer.writeBulletList(material.raioXProbabilidade.topicosQuentes || [])
    if (material.raioXProbabilidade.padraoBanca) {
      writer.writeParagraph(material.raioXProbabilidade.padraoBanca)
    }
  }

  if ((material.revisaoTurbo || []).length > 0) {
    writer.writeHeading('Revisão Turbo')
    material.revisaoTurbo.forEach((item) => {
      writer.writeSubheading(item.titulo || 'Revisão')
      writer.writeParagraph(item.conteudo || '')
    })
  }

  if ((material.pegadinhas || []).length > 0) {
    writer.writeHeading('Cuidado, Caçapa!')
    material.pegadinhas.forEach((item) => {
      writer.writeSubheading(item.titulo || 'Pegadinha')
      writer.writeParagraph(item.conteudo || '')
    })
  }

  if ((material.questoesPreditivas || []).length > 0) {
    writer.writeHeading('Questões Preditivas')
    material.questoesPreditivas.forEach((q, idx) => {
      writer.writeSubheading(`Questão ${idx + 1}`)
      writer.writeParagraph(q.enunciado || '')
      Object.entries(q.alternativas || {}).forEach(([letter, text]) => {
        writer.writeParagraph(`${letter}) ${text}`, { gapAfter: 1 })
      })
      writer.writeParagraph(`Gabarito ${q.correta || ''}: ${q.gabaritoComentado || ''}`, {
        fontStyle: 'bold',
        gapAfter: 4,
      })
    })
  }

  return writer
}

const PRINT_STYLES = `
  @page { size: A4; margin: 16mm; }
  body {
    font-family: 'Segoe UI', Tahoma, sans-serif;
    font-size: 11pt;
    line-height: 1.55;
    color: #1e293b;
    margin: 0;
    padding: 0;
  }
  h1 { font-size: 20pt; color: #065f46; margin: 0 0 8px; }
  .meta { color: #64748b; font-size: 10pt; margin-bottom: 18px; }
  .banner {
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 18px;
    font-size: 10pt;
  }
  h2 {
    font-size: 14pt;
    color: #0f766e;
    border-bottom: 2px solid #99f6e4;
    padding-bottom: 4px;
    margin: 20px 0 10px;
    page-break-after: avoid;
  }
  h3 { font-size: 12pt; color: #134e4a; margin: 14px 0 6px; page-break-after: avoid; }
  p { margin: 0 0 10px; }
  ul { margin: 0 0 12px 18px; }
  li { margin-bottom: 5px; }
  .pegadinha {
    background: #fff1f2;
    border: 1px solid #fecdd3;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 12px;
    page-break-inside: avoid;
  }
  .questao {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 12px;
    background: #f8fafc;
    page-break-inside: avoid;
  }
  .gabarito {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px dashed #cbd5e1;
    font-size: 10pt;
  }
`

/** Monta HTML para impressão / Salvar como PDF do navegador. */
export function buildConcursoMaterialPrintHtml(material = {}) {
  const topicos = (material.raioXProbabilidade?.topicosQuentes || [])
    .map((t) => `<li>${t}</li>`)
    .join('')

  const revisoes = (material.revisaoTurbo || [])
    .map(
      (item) => `
      <div>
        <h3>${item.titulo || 'Revisão'}</h3>
        <div>${item.conteudo || ''}</div>
      </div>`,
    )
    .join('')

  const pegadinhas = (material.pegadinhas || [])
    .map(
      (item) => `
      <div class="pegadinha">
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
      <div class="questao">
        <p><strong>${idx + 1}. ${q.enunciado || ''}</strong></p>
        <ul>${alternativas}</ul>
        <div class="gabarito"><strong>Gabarito ${q.correta || ''}:</strong> ${q.gabaritoComentado || ''}</div>
      </div>`
    })
    .join('')

  const dificuldade = material.analiseDificuldade?.justificativa
    ? `<div class="banner"><strong>Análise de dificuldade (${material.analiseDificuldade.nivelDificuldade || '—'}):</strong> ${material.analiseDificuldade.justificativa}</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${material.titulo || 'Material'}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <h1>${material.titulo || `${material.concurso || 'Material'} — ${material.cargo || ''}`}</h1>
  <p class="meta">${material.concurso || ''} · ${material.cargo || ''} · Banca ${material.banca || ''}</p>
  ${dificuldade}
  ${
    material.raioXProbabilidade
      ? `<section>
    <h2>Raio-X de Probabilidade</h2>
    <ul>${topicos}</ul>
    ${material.raioXProbabilidade.padraoBanca ? `<p>${material.raioXProbabilidade.padraoBanca}</p>` : ''}
  </section>`
      : ''
  }
  ${revisoes ? `<section><h2>Revisão Turbo</h2>${revisoes}</section>` : ''}
  ${pegadinhas ? `<section><h2>Cuidado, Caçapa!</h2>${pegadinhas}</section>` : ''}
  ${questoes ? `<section><h2>Questões Preditivas</h2>${questoes}</section>` : ''}
</body>
</html>`
}

/** PDF leve em texto — recomendado (KB, não MB). */
export async function downloadConcursoMaterialPdf(material, filename = 'material.pdf') {
  if (!material) throw new Error('Nenhum material para exportar.')
  const writer = buildConcursoMaterialPlainDocument(material)
  writer.save(filename)
}

/** Abre diálogo de impressão do navegador (Destino: Salvar como PDF). */
export function printConcursoMaterial(material) {
  if (!material) throw new Error('Nenhum material para imprimir.')

  const html = buildConcursoMaterialPrintHtml(material)
  const printFrame = document.createElement('iframe')
  printFrame.style.position = 'fixed'
  printFrame.style.right = '0'
  printFrame.style.bottom = '0'
  printFrame.style.width = '0'
  printFrame.style.height = '0'
  printFrame.style.border = '0'
  document.body.appendChild(printFrame)

  const doc = printFrame.contentWindow?.document
  if (!doc) {
    document.body.removeChild(printFrame)
    throw new Error('Não foi possível abrir a impressão.')
  }

  doc.open()
  doc.write(html)
  doc.close()

  printFrame.onload = () => {
    printFrame.contentWindow?.focus()
    printFrame.contentWindow?.print()
    setTimeout(() => document.body.removeChild(printFrame), 1000)
  }
}

// --- Exportação visual (material de apoio na plataforma) — mais pesada, usa imagem ---

function normalizeCloneForExport(node) {
  if (!(node instanceof HTMLElement)) return
  node.style.maxHeight = 'none'
  node.style.height = 'auto'
  node.style.overflow = 'visible'
  node.style.wordBreak = 'break-word'

  const tag = node.tagName.toLowerCase()
  if (['script', 'style', 'svg'].includes(tag)) {
    node.style.display = 'none'
    return
  }
  if (node.closest('[data-pdf-ignore]') || node.hasAttribute('data-pdf-ignore')) {
    node.style.display = 'none'
    return
  }

  Array.from(node.children).forEach(normalizeCloneForExport)
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
      dataUrl: pageCanvas.toDataURL('image/jpeg', 0.82),
      heightMm: (sliceHeight * contentWidthMm) / canvas.width,
    })
    yOffset += sliceHeight
  }
  return pages
}

/** Gera PDF a partir do HTML na tela (material de apoio dos cursos). */
export async function downloadElementAsPdf(element, filename = 'material.pdf') {
  if (!element) throw new Error('Conteúdo não encontrado para exportar.')

  const wrapper = document.createElement('div')
  wrapper.style.position = 'fixed'
  wrapper.style.left = '-20000px'
  wrapper.style.top = '0'
  wrapper.style.width = `${A4_WIDTH_PX}px`
  wrapper.style.background = '#ffffff'
  wrapper.style.padding = '24px'

  const clone = element.cloneNode(true)
  normalizeCloneForExport(clone)
  wrapper.appendChild(clone)
  document.body.appendChild(wrapper)

  try {
    const height = Math.max(wrapper.scrollHeight, clone.scrollHeight)
    const canvas = await html2canvas(wrapper, {
      backgroundColor: '#ffffff',
      scale: 1.25,
      useCORS: true,
      logging: false,
      width: A4_WIDTH_PX,
      windowWidth: A4_WIDTH_PX,
      height,
      windowHeight: height,
    })

    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const contentWidthMm = pageWidth - PDF_MARGIN_MM * 2
    const contentHeightMm = pageHeight - PDF_MARGIN_MM * 2
    const pages = sliceCanvasToPages(canvas, contentWidthMm, contentHeightMm)

    pages.forEach((page, index) => {
      if (index > 0) pdf.addPage()
      pdf.addImage(page.dataUrl, 'JPEG', PDF_MARGIN_MM, PDF_MARGIN_MM, contentWidthMm, page.heightMm)
    })

    pdf.save(sanitizeFilename(filename.replace(/\.pdf$/i, '')) + '.pdf')
  } finally {
    document.body.removeChild(wrapper)
  }
}
