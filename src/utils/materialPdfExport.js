import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

function sanitizeFilename(name = 'material') {
  return String(name)
    .replace(/[^a-zA-Z0-9\-_.\s]/g, '_')
    .replace(/\s+/g, '-')
    .slice(0, 120) || 'material'
}

/** Gera PDF a partir do HTML renderizado na tela (WYSIWYG). */
export async function downloadElementAsPdf(element, filename = 'material.pdf') {
  if (!element) {
    throw new Error('Conteúdo não encontrado para exportar.')
  }

  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
    logging: false,
    scrollY: -window.scrollY,
    windowWidth: element.scrollWidth,
    onclone: (_doc, clonedEl) => {
      clonedEl.style.background = '#ffffff'
      clonedEl.style.color = '#18181b'
      clonedEl.style.padding = '24px'
      clonedEl.querySelectorAll('*').forEach((node) => {
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
        const computed = window.getComputedStyle(node)
        const color = computed.color
        if (color && (color.includes('250') || color.includes('255, 255'))) {
          node.style.setProperty('color', '#18181b', 'important')
        }
        const bg = computed.backgroundColor
        if (bg && (bg.includes('24, 24') || bg.includes('39, 39') || bg.includes('9, 9'))) {
          node.style.setProperty('background-color', '#f8fafc', 'important')
        }
      })
    },
  })

  const imgData = canvas.toDataURL('image/jpeg', 0.92)
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const imgWidth = pageWidth
  const imgHeight = (canvas.height * imgWidth) / canvas.width

  let heightLeft = imgHeight
  let position = 0

  pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST')
  heightLeft -= pageHeight

  while (heightLeft > 0) {
    position = heightLeft - imgHeight
    pdf.addPage()
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST')
    heightLeft -= pageHeight
  }

  pdf.save(sanitizeFilename(filename.replace(/\.pdf$/i, '')) + '.pdf')
}
