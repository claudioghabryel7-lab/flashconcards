import { SITE_DESCRIPTION, SITE_LOGO_SQUARE, SITE_NAME, SITE_OG_IMAGE, SITE_URL } from '@/lib/site'

const faq = [
  {
    q: 'O que é o Concurseiro Preditivo?',
    a: 'O Concurseiro Preditivo é uma plataforma de estudos para concursos públicos que usa IA para gerar conteúdo, questões e flashcards adaptados ao edital e à banca do seu concurso.',
  },
  {
    q: 'Para quais bancas o Concurseiro Preditivo funciona?',
    a: 'A plataforma adapta questões e material ao estilo da banca configurada no curso — Cebraspe, FGV, VUNESP, FCC, Instituto AOCP e outras.',
  },
  {
    q: 'O Concurseiro Preditivo substitui o edital?',
    a: 'Não. O edital verticalizado é a base; a IA organiza tópicos, gera resumos, questões preditivas e flashcards para acelerar sua revisão.',
  },
]

export default function HomeJsonLd() {
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: {
      '@type': 'ImageObject',
      url: SITE_LOGO_SQUARE,
      width: 192,
      height: 192,
    },
    image: SITE_OG_IMAGE,
    description: SITE_DESCRIPTION,
    sameAs: [SITE_URL],
  }

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/cursos?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }

  const faqPage = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  }

  const educational = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    areaServed: 'BR',
    knowsAbout: [
      'concursos públicos',
      'edital verticalizado',
      'questões preditivas',
      'flashcards com IA',
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(educational) }}
      />
    </>
  )
}
