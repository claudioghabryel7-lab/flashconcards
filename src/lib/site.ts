/** URL canônica do site (SEO, sitemap, Open Graph). */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
  'https://www.flashconcards.com.br'

export const SITE_NAME = 'Concurseiro Preditivo'

export const SITE_DESCRIPTION =
  'Concurseiro Preditivo: plataforma de estudos preditivos para concursos públicos com IA, edital verticalizado, questões por banca, flashcards e simulados.'

export const SITE_KEYWORDS = [
  'Concurseiro Preditivo',
  'concurseiro preditivo',
  'concurso público',
  'estudo para concurso',
  'questões preditivas',
  'edital verticalizado',
  'flashcards IA',
  'Cebraspe',
  'FGV',
  'VUNESP',
  'simulado concurso',
  'preparatório concurso',
]
