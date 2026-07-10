import { SITE_URL } from '../lib/site'

export const EMAIL_LOGO_URL = `${SITE_URL}/course-icons/logo.png`

export const EMAIL_FEATURE_CHIPS = [
  '📚 Flashcards',
  '🤖 IA Preditiva',
  '🎯 Mentor',
  '📊 Progresso',
]

/** Tokens visuais alinhados ao pack do site */
export const EMAIL_DESIGN = {
  bg: '#f6f4ff',
  card: '#ffffff',
  heroBg: 'linear-gradient(180deg, #faf8ff 0%, #ffffff 100%)',
  text: '#18181b',
  muted: '#71717a',
  faint: '#a1a1aa',
  body: '#3f3f46',
  border: 'rgba(15, 15, 20, 0.08)',
  divider: '#f0f0f2',
  accent: '#7c3aed',
  accentMid: '#6366f1',
  accent2: '#0891b2',
  accent3: '#db2777',
  accent4: '#d97706',
  aurora1: 'rgba(124, 58, 237, 0.14)',
  aurora2: 'rgba(8, 145, 178, 0.12)',
  aurora3: 'rgba(219, 39, 119, 0.08)',
  gridDot: 'rgba(124, 58, 237, 0.10)',
  gradient: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 50%, #0891b2 100%)',
  gradientText: 'linear-gradient(135deg, #7c3aed 0%, #0891b2 50%, #db2777 100%)',
  gradientStrip: 'linear-gradient(90deg, #7c3aed, #6366f1, #0891b2, #db2777)',
  glow: '0 4px 24px rgba(124, 58, 237, 0.28)',
  cardShadow: '0 24px 60px rgba(124, 58, 237, 0.10), 0 0 0 1px rgba(124, 58, 237, 0.04)',
  bulletAccents: ['#7c3aed', '#0891b2', '#db2777', '#d97706'],
}

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
  "highlight": "frase de destaque curta e impactante (ou string vazia)",
  "bullets": ["benefício ou ponto 1", "ponto 2"] ,
  "ctaLabel": "texto do botão de ação",
  "ctaUrl": "https://www.flashconcards.com.br/dashboard"
}`
}
