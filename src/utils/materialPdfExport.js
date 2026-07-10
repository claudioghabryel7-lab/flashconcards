import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

const PDF_MARGIN_MM = 12
const A4_CONTENT_WIDTH_PX = 794

function sanitizeFilename(name = 'material') {
  return (
    String(name)
      .replace(/[^a-zA-Z0-9\-_.\s]/g, '_')
      .replace(/\s+/g, '-')
      .slice(0, 120) || 'material'
  )
}

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Conteúdo HTML gerado pela IA — mantém formatação do site. */
function richHtml(html = '') {
  return String(html || '')
}

const PRINT_STYLES = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #334155;
    margin: 0;
    padding: 0;
    background: #fff;
  }
  .doc-header {
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 16px;
    margin-bottom: 24px;
  }
  .kicker {
    font-family: ui-monospace, monospace;
    font-size: 9pt;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #64748b;
    margin: 0 0 6px;
  }
  h1.doc-title {
    font-size: 22pt;
    font-weight: 800;
    color: #0f172a;
    margin: 0 0 8px;
    line-height: 1.2;
  }
  .subtitle { color: #475569; font-style: italic; margin: 0 0 8px; font-size: 10.5pt; }
  .course-note { color: #475569; margin: 0; font-size: 10.5pt; }
  .course-note strong { color: #0f172a; }

  .card {
    border-radius: 12px;
    padding: 18px 20px;
    margin-bottom: 22px;
    page-break-inside: avoid;
  }
  .card-orange {
    background: linear-gradient(135deg, #fff7ed 0%, #fef3c7 100%);
    border: 1px solid #fed7aa;
  }
  .card-blue {
    background: linear-gradient(135deg, #eff6ff 0%, #e0e7ff 100%);
    border: 1px solid #bfdbfe;
  }
  .card-red {
    background: #fff1f2;
    border: 1px solid #fecdd3;
  }
  .card-neutral {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
  }
  .card-section {
    background: #f8fafc;
    border-left: 4px solid #7c3aed;
    border-radius: 0 12px 12px 0;
    padding: 16px 20px;
    margin-bottom: 18px;
    page-break-inside: avoid;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14pt;
    font-weight: 800;
    color: #0f172a;
    margin: 0 0 14px;
  }
  .section-title .icon { font-size: 16pt; }

  .sub-title {
    font-size: 10.5pt;
    font-weight: 700;
    color: #475569;
    margin: 0 0 8px;
  }

  .hot-list { margin: 0; padding: 0; list-style: none; }
  .hot-list li {
    display: flex;
    gap: 8px;
    margin-bottom: 6px;
    font-size: 10.5pt;
    color: #475569;
  }
  .hot-list .num { color: #ea580c; font-weight: 800; min-width: 18px; }

  .banner {
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    border-radius: 10px;
    padding: 14px;
    margin-bottom: 20px;
    font-size: 10pt;
    color: #065f46;
  }

  .questao-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 16px;
    page-break-inside: avoid;
  }
  .questao-badge {
    font-size: 9pt;
    font-weight: 700;
    color: #7c3aed;
    margin-bottom: 8px;
    display: block;
  }
  .questao-enunciado {
    font-size: 10.5pt;
    color: #334155;
    margin: 0 0 12px;
    white-space: pre-line;
  }
  .alt {
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 8px;
    font-size: 10pt;
    border: 1px solid #e2e8f0;
    background: #fff;
    color: #334155;
  }
  .alt.correct {
    background: #dcfce7;
    border: 2px solid #22c55e;
    color: #166534;
    font-weight: 600;
  }
  .gabarito-box {
    background: #eff6ff;
    border-radius: 8px;
    padding: 12px;
    margin-top: 10px;
  }
  .gabarito-box h5 {
    margin: 0 0 6px;
    font-size: 10pt;
    color: #1d4ed8;
  }

  .tipo-badge {
    display: inline-block;
    margin-left: 8px;
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 9pt;
    font-weight: 600;
    background: #ede9fe;
    color: #6d28d9;
    vertical-align: middle;
  }

  .ia-content-enhanced { max-width: none; color: #475569; font-size: 10.5pt; }
  .ia-content-enhanced p { margin: 0 0 12px; line-height: 1.65; }
  .ia-content-enhanced p:first-of-type { font-size: 11pt; font-weight: 500; }
  .ia-content-enhanced strong, .ia-content-enhanced b {
    font-weight: 700;
    background: linear-gradient(to right, #eff6ff, #e0e7ff);
    padding: 2px 6px;
    border-left: 3px solid #3b82f6;
    border-radius: 2px;
  }
  .ia-content-enhanced h1 { font-size: 18pt; font-weight: 800; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin: 16px 0 10px; color: #0f172a; }
  .ia-content-enhanced h2 {
    font-size: 14pt; font-weight: 800; color: #0f172a;
    border-left: 4px solid #3b82f6; padding: 6px 0 6px 12px;
    background: #f8fafc; margin: 14px 0 8px;
  }
  .ia-content-enhanced h3 { font-size: 12pt; font-weight: 700; border-left: 3px solid #6366f1; padding-left: 10px; margin: 12px 0 6px; color: #1e293b; }
  .ia-content-enhanced ul, .ia-content-enhanced ol { margin: 8px 0 12px 20px; padding: 0; }
  .ia-content-enhanced li { margin-bottom: 6px; }
  .ia-content-enhanced table { width: 100%; border-collapse: collapse; margin: 14px 0; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
  .ia-content-enhanced thead { background: linear-gradient(to right, #2563eb, #4f46e5); }
  .ia-content-enhanced th { color: #fff; padding: 8px 10px; text-align: left; font-size: 10pt; }
  .ia-content-enhanced td { padding: 8px 10px; border-top: 1px solid #e2e8f0; font-size: 10pt; }
  .ia-content-enhanced blockquote {
    border-left: 4px solid #3b82f6; padding: 8px 12px; margin: 12px 0;
    background: #eff6ff; font-style: italic; border-radius: 0 8px 8px 0;
  }
  .ia-content-enhanced code {
    background: #f1f5f9; color: #be185d; padding: 2px 6px; border-radius: 4px;
    font-family: ui-monospace, monospace; font-size: 9.5pt;
  }
`

function resolveTitle(material = {}) {
  return (
    material.titulo ||
    material.materia ||
    `${material.concurso || 'Material'}${material.cargo ? ` — ${material.cargo}` : ''}`
  )
}

function resolveMeta(material = {}) {
  const parts = [
    material.subtitulo,
    material.materia && material.materia !== resolveTitle(material) ? material.materia : null,
    material.concurso,
    material.cargo,
    material.banca ? `Banca ${material.banca}` : null,
  ].filter(Boolean)
  return parts.join(' · ')
}

/** HTML de impressão fiel ao layout do site. */
export function buildMaterialPrintHtml(material = {}, options = {}) {
  const title = escapeHtml(resolveTitle(material))
  const meta = escapeHtml(resolveMeta(material))
  const courseName = escapeHtml(options.courseName || material.courseName || '')

  const dificuldade = material.analiseDificuldade?.justificativa
    ? `<div class="banner"><strong>Análise de dificuldade (${escapeHtml(material.analiseDificuldade.nivelDificuldade || '—')}):</strong> ${escapeHtml(material.analiseDificuldade.justificativa)}</div>`
    : ''

  const raioX = material.raioXProbabilidade
    ? `<div class="card card-orange">
        <h2 class="section-title"><span class="icon">🔥</span> Raio-X de Probabilidade</h2>
        ${
          (material.raioXProbabilidade.topicosQuentes || []).length
            ? `<p class="sub-title">Top Assuntos Quentes</p>
               <ul class="hot-list">
                 ${material.raioXProbabilidade.topicosQuentes
                   .map(
                     (t, i) =>
                       `<li><span class="num">${i + 1}.</span><span>${escapeHtml(t)}</span></li>`,
                   )
                   .join('')}
               </ul>`
            : ''
        }
        ${
          material.raioXProbabilidade.padraoBanca
            ? `<p class="sub-title">O Padrão da Banca</p>
               <div class="ia-content-enhanced">${richHtml(material.raioXProbabilidade.padraoBanca)}</div>`
            : ''
        }
      </div>`
    : ''

  const revisoes = (material.revisaoTurbo || []).length
    ? `<div class="card card-blue">
        <h2 class="section-title"><span class="icon">💡</span> Revisão Turbo</h2>
        ${material.revisaoTurbo
          .map(
            (item) => `
          <div style="margin-bottom:14px">
            <p class="sub-title">${escapeHtml(item.titulo || 'Revisão')}</p>
            <div class="ia-content-enhanced">${richHtml(item.conteudo)}</div>
          </div>`,
          )
          .join('')}
      </div>`
    : ''

  const pegadinhas = (material.pegadinhas || []).length
    ? `<div class="card card-red">
        <h2 class="section-title"><span class="icon">⚠️</span> Cuidado, Caçapa!</h2>
        ${material.pegadinhas
          .map(
            (item) => `
          <div style="margin-bottom:14px;color:#be123c">
            <p class="sub-title" style="color:#be123c">${escapeHtml(item.titulo || 'Pegadinha')}</p>
            <div class="ia-content-enhanced" style="color:#be123c">${richHtml(item.conteudo)}</div>
          </div>`,
          )
          .join('')}
      </div>`
    : ''

  const questoes = (material.questoesPreditivas || []).length
    ? `<div style="margin-bottom:22px">
        <h2 class="section-title"><span class="icon">📚</span> Questões Preditivas</h2>
        ${material.questoesPreditivas
          .map((q, idx) => {
            const alts = Object.entries(q.alternativas || {})
              .map(
                ([letter, text]) =>
                  `<div class="alt ${letter === q.correta ? 'correct' : ''}">${escapeHtml(letter)}) ${escapeHtml(text)}</div>`,
              )
              .join('')
            return `
          <div class="questao-card">
            <span class="questao-badge">Aposta ${idx + 1} de ${material.questoesPreditivas.length}</span>
            <p class="questao-enunciado">${escapeHtml(q.enunciado || '')}</p>
            ${alts}
            ${
              q.gabaritoComentado
                ? `<div class="gabarito-box">
                    <h5>💡 Gabarito Comentado</h5>
                    <div class="ia-content-enhanced">${richHtml(q.gabaritoComentado)}</div>
                  </div>`
                : ''
            }
          </div>`
          })
          .join('')}
      </div>`
    : ''

  const content = material.content
    ? `<div class="card card-neutral">
        <div class="ia-content-enhanced">${richHtml(material.content)}</div>
      </div>`
    : ''

  const secoes = (material.secoes || []).length
    ? material.secoes
        .map((secao, index) => {
          const label = escapeHtml(secao.titulo || `Seção ${index + 1}`)
          const tipo = secao.tipo
            ? `<span class="tipo-badge">${escapeHtml(secao.tipo)}</span>`
            : ''
          return `
        <div class="card-section">
          <h3 style="margin:0 0 10px;font-size:14pt;color:#7c3aed">${label}${tipo}</h3>
          <div class="ia-content-enhanced">${richHtml(secao.conteudo)}</div>
        </div>`
        })
        .join('')
    : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <div class="doc-header">
    <p class="kicker">Material de apoio</p>
    <h1 class="doc-title">${title}</h1>
    ${meta ? `<p class="subtitle">${meta}</p>` : ''}
    ${courseName ? `<p class="course-note">Material elaborado para <strong>${courseName}</strong>.</p>` : ''}
  </div>
  ${dificuldade}
  ${raioX}
  ${revisoes}
  ${pegadinhas}
  ${questoes}
  ${content}
  ${secoes}
</body>
</html>`
}

/** @deprecated use buildMaterialPrintHtml */
export function buildConcursoMaterialPrintHtml(material = {}) {
  return buildMaterialPrintHtml(material)
}

async function renderPrintHtmlToPdf(html, filename) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText =
    'position:fixed;left:-20000px;top:0;width:794px;height:0;border:0;visibility:hidden'
  document.body.appendChild(iframe)

  const cleanup = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
  }

  try {
    const iDoc = iframe.contentDocument || iframe.contentWindow?.document
    if (!iDoc) throw new Error('Não foi possível preparar o PDF.')

    iDoc.open()
    iDoc.write(html)
    iDoc.close()

    await new Promise((resolve) => {
      if (iframe.contentWindow?.document?.readyState === 'complete') resolve()
      else iframe.onload = () => resolve()
      setTimeout(resolve, 350)
    })

    const body = iframe.contentDocument?.body
    if (!body) throw new Error('Conteúdo do PDF vazio.')

    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })

    await pdf.html(body, {
      margin: [PDF_MARGIN_MM, PDF_MARGIN_MM, PDF_MARGIN_MM, PDF_MARGIN_MM],
      width: 186,
      windowWidth: A4_CONTENT_WIDTH_PX,
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        letterRendering: true,
      },
      autoPaging: 'slice',
    })

    pdf.save(sanitizeFilename(filename.replace(/\.pdf$/i, '')) + '.pdf')
  } finally {
    cleanup()
  }
}

/** Baixa PDF formatado igual ao site (layout, cores e cards). */
export async function downloadMaterialPdf(material, filename = 'material.pdf', options = {}) {
  if (!material) throw new Error('Nenhum material para exportar.')
  const html = buildMaterialPrintHtml(material, options)
  await renderPrintHtmlToPdf(html, filename)
}

/** @deprecated use downloadMaterialPdf */
export async function downloadConcursoMaterialPdf(material, filename = 'material.pdf') {
  return downloadMaterialPdf(material, filename)
}

function openPrintFrame(html) {
  const printFrame = document.createElement('iframe')
  printFrame.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
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
    setTimeout(() => document.body.removeChild(printFrame), 1200)
  }
}

/** Abre diálogo de impressão (Destino: Salvar como PDF). */
export function printMaterial(material, options = {}) {
  if (!material) throw new Error('Nenhum material para imprimir.')
  openPrintFrame(buildMaterialPrintHtml(material, options))
}

/** @deprecated use printMaterial */
export function printConcursoMaterial(material) {
  return printMaterial(material)
}

// --- Fallback: captura do DOM na tela (evitar quando possível) ---

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
      dataUrl: pageCanvas.toDataURL('image/jpeg', 0.88),
      heightMm: (sliceHeight * contentWidthMm) / canvas.width,
    })
    yOffset += sliceHeight
  }
  return pages
}

/** Captura o HTML visível na tela (legado — prefira downloadMaterialPdf). */
export async function downloadElementAsPdf(element, filename = 'material.pdf') {
  if (!element) throw new Error('Conteúdo não encontrado para exportar.')

  const wrapper = document.createElement('div')
  wrapper.style.cssText = `position:fixed;left:-20000px;top:0;width:${A4_CONTENT_WIDTH_PX}px;background:#fff;padding:24px`

  const clone = element.cloneNode(true)
  normalizeCloneForExport(clone)
  wrapper.appendChild(clone)
  document.body.appendChild(wrapper)

  try {
    const height = Math.max(wrapper.scrollHeight, clone.scrollHeight)
    const canvas = await html2canvas(wrapper, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
      width: A4_CONTENT_WIDTH_PX,
      windowWidth: A4_CONTENT_WIDTH_PX,
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
