/**
 * Exporta material de apoio (conteúdo completo) para PDF.
 * Evita falhas comuns do jsPDF: emojis, HTML, quebra de página e download no mobile.
 */
import * as JsPdfModule from 'jspdf'
import { mapOrderedAlternativas } from './questaoAlternativas.js'
import { stripHtml } from './htmlTextHelpers.js'
import {
  extractRevisaoTurboItems,
  extractPegadinhas,
  normalizeMaterialStructure,
} from './contentDepthRules.js'

const jsPDF = JsPdfModule.jsPDF || JsPdfModule.default?.jsPDF || JsPdfModule.default
if (typeof jsPDF !== 'function') {
  throw new Error('jsPDF indisponível neste ambiente')
}

/** Remove emojis / símbolos fora do Latin-1 (Helvetica do jsPDF). */
export function sanitizePdfText(value) {
  if (value == null) return ''
  let text = typeof value === 'string' ? value : String(value)
  text = stripHtml(text)
  // Emojis e pictogramas
  text = text.replace(/\p{Extended_Pictographic}/gu, '')
  // Variation selectors / ZWJ
  text = text.replace(/[\uFE0E\uFE0F\u200D]/g, '')
  // Normaliza espaços
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
    // Preferível em desktop
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
 * @param {object} conteudo material do tópico
 * @returns {Promise<void>}
 */
export async function downloadMaterialPdf(conteudo) {
  if (!conteudo) throw new Error('Sem conteúdo para exportar')
  conteudo = normalizeMaterialStructure(conteudo)

  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 16
  const maxWidth = pageWidth - margin * 2
  let y = margin

  const ensureSpace = (needed = 8) => {
    if (y + needed > pageHeight - margin) {
      pdf.addPage()
      y = margin
    }
  }

  const writeLines = (raw, { size = 11, bold = false, color = [0, 0, 0], indent = 0 } = {}) => {
    const text = sanitizePdfText(raw)
    if (!text) return

    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(size)
    pdf.setTextColor(color[0], color[1], color[2])

    const lineHeight = size * 0.42
    const usableWidth = Math.max(40, maxWidth - indent)
    const lines = pdf.splitTextToSize(text, usableWidth)

    lines.forEach((line) => {
      ensureSpace(lineHeight + 2)
      pdf.text(line, margin + indent, y)
      y += lineHeight
    })
    y += 1.5
  }

  const sectionBanner = (label, fill) => {
    ensureSpace(14)
    pdf.setFillColor(fill[0], fill[1], fill[2])
    pdf.rect(margin, y, maxWidth, 9, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(12)
    pdf.text(sanitizePdfText(label), margin + 3, y + 6)
    y += 12
  }

  // Cabeçalho
  pdf.setFillColor(255, 140, 0)
  pdf.rect(margin, y, maxWidth, 18, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  pdf.text('ConCursos', pageWidth / 2, y + 7, { align: 'center' })
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.text('Material de Apoio', pageWidth / 2, y + 13, { align: 'center' })
  y += 24

  if (conteudo.titulo) writeLines(conteudo.titulo, { size: 16, bold: true })
  if (conteudo.subtitulo) writeLines(conteudo.subtitulo, { size: 11, color: [113, 113, 122] })
  if (conteudo.materia) {
    ensureSpace(10)
    pdf.setFillColor(244, 244, 245)
    pdf.rect(margin, y, maxWidth, 8, 'F')
    writeLines(`Materia: ${conteudo.materia}`, { size: 11, bold: true, indent: 2 })
    y += 2
  }

  const raio = conteudo.raioXProbabilidade
  if (raio) {
    sectionBanner('Raio-X de Probabilidade', [234, 88, 12])
    if (Array.isArray(raio.topicosQuentes) && raio.topicosQuentes.length) {
      writeLines('Top assuntos quentes:', { size: 11, bold: true })
      raio.topicosQuentes.forEach((assunto) => {
        writeLines(`- ${typeof assunto === 'string' ? assunto : assunto?.titulo || assunto?.nome || ''}`, {
          size: 10,
          indent: 3,
        })
      })
    }
    if (raio.padraoBanca) {
      writeLines(`Padrao da banca: ${raio.padraoBanca}`, { size: 10 })
    }
  }

  const turboItems = extractRevisaoTurboItems(conteudo)
  if (turboItems.length) {
    sectionBanner('Revisao Turbo', [37, 99, 235])
    writeLines('Resumos:', { size: 11, bold: true })
    turboItems.forEach((resumo, idx) => {
      writeLines(`${idx + 1}. ${resumo.titulo}`, { size: 10, bold: true, indent: 2 })
      writeLines(resumo.conteudo, { size: 10, indent: 4 })
    })
  }

  const pegadinhas = extractPegadinhas(conteudo)
  if (pegadinhas.length) {
    writeLines('Cuidado (pegadinhas):', { size: 11, bold: true, color: [185, 28, 28] })
    pegadinhas.forEach((pegadinha, idx) => {
      const titulo =
        typeof pegadinha === 'string'
          ? pegadinha
          : pegadinha?.titulo || pegadinha?.nome || `Item ${idx + 1}`
      writeLines(`${idx + 1}. ${titulo}`, { size: 10, bold: true, indent: 2, color: [185, 28, 28] })
      if (typeof pegadinha === 'object' && pegadinha?.conteudo) {
        writeLines(pegadinha.conteudo, { size: 10, indent: 4, color: [127, 29, 29] })
      }
    })
  }

  if (Array.isArray(conteudo.questoesPreditivas) && conteudo.questoesPreditivas.length) {
    sectionBanner('Questoes Preditivas', [22, 163, 74])
    conteudo.questoesPreditivas.forEach((questao, idx) => {
      writeLines(`Questao ${idx + 1} de ${conteudo.questoesPreditivas.length}`, {
        size: 11,
        bold: true,
      })
      writeLines(questao?.enunciado, { size: 10 })
      if (questao?.alternativas) {
        mapOrderedAlternativas(questao.alternativas).forEach(([letra, alt]) => {
          const isCorrect = letra === questao.correta
          writeLines(`${letra}) ${alt}`, {
            size: 9,
            indent: 3,
            bold: isCorrect,
            color: isCorrect ? [22, 163, 74] : [82, 82, 91],
          })
        })
      }
      if (questao?.gabaritoComentado) {
        writeLines('Gabarito comentado:', { size: 10, bold: true, color: [37, 99, 235] })
        writeLines(questao.gabaritoComentado, { size: 9, indent: 2, color: [30, 64, 175] })
      }
      y += 2
    })
  }

  if (conteudo.content) {
    sectionBanner('Conteudo Completo', [82, 82, 91])
    writeLines(conteudo.content, { size: 10 })
  }

  if (Array.isArray(conteudo.secoes) && conteudo.secoes.length) {
    sectionBanner('Secoes do Conteudo', [82, 82, 91])
    conteudo.secoes.forEach((secao, idx) => {
      writeLines(`${idx + 1}. ${secao?.titulo || `Secao ${idx + 1}`}`, { size: 12, bold: true })
      if (secao?.conteudo) writeLines(secao.conteudo, { size: 10 })
      if (Array.isArray(secao?.itens)) {
        secao.itens.forEach((item) => writeLines(`- ${item}`, { size: 9, indent: 3 }))
      }
      y += 2
    })
  }

  // Rodapé em todas as páginas
  const pageCount = pdf.getNumberOfPages()
  const footer = `Gerado em ${new Date().toLocaleDateString('pt-BR')} | ConCursos`
  for (let i = 1; i <= pageCount; i += 1) {
    pdf.setPage(i)
    pdf.setDrawColor(212, 212, 216)
    pdf.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(113, 113, 122)
    pdf.text(footer, pageWidth / 2, pageHeight - 7, { align: 'center' })
    pdf.text(`Pag. ${i}/${pageCount}`, pageWidth - margin, pageHeight - 7, { align: 'right' })
  }

  const fileName = safeFileName([conteudo.materia, conteudo.titulo || 'topico'])
  triggerPdfDownload(pdf, fileName)
}
