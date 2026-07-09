import { SITE_URL } from '../lib/site'

export const EMAIL_LOGO_URL = `${SITE_URL}/course-icons/logo.png`

export function buildEmailPreviewModel({
  title = '',
  subtitle = '',
  message = '',
  highlight = '',
  bullets = [],
  ctaLabel = '',
  ctaUrl = '',
}) {
  const paragraphs = String(message)
    .split(/\n{2,}|\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  return {
    title: title.trim(),
    subtitle: subtitle.trim(),
    paragraphs,
    highlight: highlight.trim(),
    bullets: bullets.filter(Boolean),
    ctaLabel: ctaLabel.trim(),
    ctaUrl: ctaUrl.trim(),
  }
}

export function buildAiEmailPrompt(brief) {
  return `Você é um designer de emails premium para a plataforma "Concurseiro Preditivo" (estudos para concursos públicos com IA, flashcards e simulados).

O administrador quer enviar este comunicado:
"""
${brief.trim()}
"""

Crie um email profissional, moderno, engajante e persuasivo em português brasileiro.
Use tom acolhedor mas profissional. Inclua CTA relevante quando fizer sentido.

Retorne APENAS um JSON válido (sem markdown) neste formato:
{
  "subject": "assunto curto e chamativo para a caixa de entrada",
  "title": "título principal grande no cabeçalho do email",
  "subtitle": "subtítulo curto complementar",
  "message": "corpo do email em parágrafos separados por \\n\\n",
  "highlight": "frase de destaque para box colorido (ou string vazia)",
  "bullets": ["benefício ou ponto 1", "ponto 2"] ,
  "ctaLabel": "texto do botão de ação",
  "ctaUrl": "https://www.flashconcards.com.br/dashboard"
}`
}
