import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

const A4_CONTENT_PX = 720
const PDF_MARGIN_MM = 10
const CAPTURE_SCALE = 2

function sanitizeFilename(name = 'material') {
  return String(name)
    .replace(/[^a-zA-Z0-9\-_.\s]/g, '_')
    .replace(/\s+/g, '-')
    .slice(0, 120) || 'material'
}

function styleNodeForPdf(node) {
  if (!(node instanceof HTMLElement)) return
  const tag = node.tagName.toLowerCase()
  if (['script', 'style', 'svg'].includes(tag)) {
    node.style.display = 'none'
    return
  }
  if (node.closest('[data-pdf-ignore]') || node.hasAttribute('data-pdf-ignore')) {
    node.style.display = 'none'
    return
  }

  node.style.overflow = 'visible'
  node.style.wordBreak = 'break-word'
  node.style.overflowWrap = 'break-word'
  node.style.hyphens = 'auto'

  const computed = window.getComputedStyle(node)
  const color = computed.color
  if (color && (color.includes('250') || color.includes('255, 255'))) {
    node.style.setProperty('color', '#18181b', 'important')
  }
  const bg = computed.backgroundColor
  if (bg && (bg.includes('24, 24') || bg.includes('39, 39') || bg.includes('9, 9'))) {
    node.style.setProperty('background-color', '#f8fafc', 'important')
  }
}

function prepareExportWrapper(element) {
  const wrapper = document.createElement('div')
  wrapper.style.position = 'fixed'
  wrapper.style.left = '-12000px'
  wrapper.style.top = '0'
  wrapper.style.width = `${A4_CONTENT_PX}px`
  wrapper.style.maxWidth = `${A4_CONTENT_PX}px`
  wrapper.style.background = '#ffffff'
  wrapper.style.color = '#18181b'
  wrapper.style.padding = '28px'
  wrapper.style.boxSizing = 'border-box'
  wrapper.style.overflow = 'visible'

  const clone = element.cloneNode(true)
  clone.style.width = '100%'
  clone.style.maxWidth = '100%'
  clone.style.background = '#ffffff'
  clone.style.color = '#18181b'
  clone.style.overflow = 'visible'
  clone.querySelectorAll('*').forEach(styleNodeForPdf)
  styleNodeForPdf(clone)

  wrapper.appendChild(clone)
  document.body.appendChild(wrapper)
  return wrapper
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

/** Gera PDF a partir do HTML renderizado na tela (WYSIWYG), sem cortar palavras nas quebras de página. */
export async function downloadElementAsPdf(element, filename = 'material.pdf') {
  if (!element) {
    throw new Error('Conteúdo não encontrado para exportar.')
  }

  const wrapper = prepareExportWrapper(element)

  try {
    const canvas = await html2canvas(wrapper, {
      backgroundColor: '#ffffff',
      scale: CAPTURE_SCALE,
      useCORS: true,
      logging: false,
      width: A4_CONTENT_PX,
      windowWidth: A4_CONTENT_PX,
      scrollY: 0,
      scrollX: 0,
    })

    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const contentWidthMm = pageWidth - PDF_MARGIN_MM * 2
    const contentHeightMm = pageHeight - PDF_MARGIN_MM * 2

    const pages = sliceCanvasToPages(canvas, contentWidthMm, contentHeightMm)

    pages.forEach((page, index) => {
      if (index > 0) pdf.addPage()
      pdf.addImage(page.dataUrl, 'PNG', PDF_MARGIN_MM, PDF_MARGIN_MM, contentWidthMm, page.heightMm)
    })

    pdf.save(sanitizeFilename(filename.replace(/\.pdf$/i, '')) + '.pdf')
  } finally {
    document.body.removeChild(wrapper)
  }
}
