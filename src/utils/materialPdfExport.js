/**
 * Exporta o material de apoio para PDF com a mesma aparência da tela.
 * Captura o DOM renderizado (html2canvas) e pagina em A4 via jsPDF.
 */
import html2canvas from 'html2canvas'
import * as JsPdfModule from 'jspdf'
import { stripHtml } from './htmlTextHelpers.js'

const jsPDF = JsPdfModule.jsPDF || JsPdfModule.default?.jsPDF || JsPdfModule.default
if (typeof jsPDF !== 'function') {
  throw new Error('jsPDF indisponível neste ambiente')
}

/** Remove emojis / símbolos fora do Latin-1 (Helvetica do jsPDF) — legado. */
export function sanitizePdfText(value) {
  if (value == null) return ''
  let text = typeof value === 'string' ? value : String(value)
  text = stripHtml(text)
  text = text.replace(/\p{Extended_Pictographic}/gu, '')
  text = text.replace(/[\uFE0E\uFE0F\u200D]/g, '')
  text = text.replace(/\u00A0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
  return text.trim()
}

function safeFileName(parts = []) {
  const base = parts
    .map((p) => sanitizePdfText(p))
    .filter(Boolean)
    .join('-')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\-_.]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return `${base || 'material-apoio'}.pdf`
}

function triggerPdfDownload(pdf, fileName) {
  try {
    pdf.save(fileName)
    return
  } catch (err) {
    console.warn('pdf.save falhou, tentando blob:', err)
  }

  const blob = pdf.output('blob')
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/**
 * Captura um elemento da página (mesmo visual do site) e baixa PDF A4 multipágina.
 * @param {HTMLElement} element
 * @param {{ fileName?: string, fileNameParts?: string[] }} [opts]
 */
export async function downloadMaterialPdfFromElement(element, opts = {}) {
  if (!element) throw new Error('Elemento do material não encontrado para exportar')

  const fileName =
    opts.fileName ||
    safeFileName(opts.fileNameParts || ['material-apoio'])

  // Força fundo claro na captura para o PDF ficar legível (mesmo no dark mode)
  const canvas = await html2canvas(element, {
    scale: Math.min(2, window.devicePixelRatio || 2),
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: element.scrollWidth,
    onclone: (_doc, cloned) => {
      cloned.querySelectorAll('[data-pdf-hide]').forEach((node) => {
        node.style.display = 'none'
      })
      cloned.style.background = '#ffffff'
      cloned.style.color = '#0f172a'
      cloned.style.boxShadow = 'none'
      // Neutraliza tokens escuros comuns para bater com a leitura do site em claro
      cloned.querySelectorAll('*').forEach((node) => {
        if (!(node instanceof HTMLElement)) return
        const style = node.style
        if (!style) return
        // Mantém gradients/cores inline do conteúdo; só remove fundo transparente problemático
        if (node.classList?.contains?.('dark\\:text-slate-100')) {
          /* no-op — classes dark não aplicam sem .dark no clone se removermos */
        }
      })
      const darkRoot = cloned.closest?.('.dark')
      if (darkRoot) darkRoot.classList.remove('dark')
      cloned.classList?.remove?.('dark')
      _doc.documentElement.classList.remove('dark')
      _doc.body?.classList?.remove?.('dark')
    },
  })

  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 10
  const usableWidth = pageWidth - margin * 2
  const usableHeight = pageHeight - margin * 2

  const imgWidth = usableWidth
  const imgHeight = (canvas.height * imgWidth) / canvas.width

  // Fatia o canvas em páginas A4
  const pageCanvas = document.createElement('canvas')
  const pageCtx = pageCanvas.getContext('2d')
  if (!pageCtx) throw new Error('Canvas não suportado neste navegador')

  const pxPerMm = canvas.width / imgWidth
  const pageHeightPx = Math.floor(usableHeight * pxPerMm)
  let srcY = 0
  let pageIndex = 0

  while (srcY < canvas.height) {
    const sliceHeight = Math.min(pageHeightPx, canvas.height - srcY)
    pageCanvas.width = canvas.width
    pageCanvas.height = sliceHeight
    pageCtx.fillStyle = '#ffffff'
    pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    pageCtx.drawImage(
      canvas,
      0,
      srcY,
      canvas.width,
      sliceHeight,
      0,
      0,
      canvas.width,
      sliceHeight,
    )

    const sliceData = pageCanvas.toDataURL('image/jpeg', 0.92)
    const sliceMm = sliceHeight / pxPerMm
    if (pageIndex > 0) pdf.addPage()
    pdf.addImage(sliceData, 'JPEG', margin, margin, imgWidth, sliceMm)

    srcY += sliceHeight
    pageIndex += 1
  }

  // Evita variável não usada se canvas for muito curto
  void imgHeight

  triggerPdfDownload(pdf, fileName)
}

/**
 * @deprecated Prefer downloadMaterialPdfFromElement para fidelidade visual.
 * Mantido como fallback textual se não houver DOM.
 */
export async function downloadMaterialPdf(conteudo) {
  if (!conteudo) throw new Error('Sem conteúdo para exportar')

  // Fallback mínimo: gera PDF textual curto (só se alguém ainda chamar sem elemento)
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  const margin = 16
  let y = margin
  const write = (raw, size = 11) => {
    const text = sanitizePdfText(raw)
    if (!text) return
    pdf.setFontSize(size)
    const lines = pdf.splitTextToSize(text, pdf.internal.pageSize.getWidth() - margin * 2)
    lines.forEach((line) => {
      if (y > pdf.internal.pageSize.getHeight() - margin) {
        pdf.addPage()
        y = margin
      }
      pdf.text(line, margin, y)
      y += size * 0.45
    })
    y += 2
  }

  write(conteudo.titulo || conteudo.materia || 'Material de apoio', 16)
  write(conteudo.subtitulo || '', 11)
  if (conteudo.content) write(conteudo.content, 10)
  triggerPdfDownload(pdf, safeFileName([conteudo.materia, conteudo.titulo || 'topico']))
}
