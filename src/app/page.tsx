import type { Metadata } from 'next'
import CPHero from '@/components/cp/CPHero'
import HomeJsonLd from '@/components/cp/HomeJsonLd'
import HomeCourseChatbot from '@/components/cp/HomeCourseChatbot'
import {
  CtaBanner,
  FeaturedCourses,
  HomeFaq,
  HowItWorks,
  StatsStrip,
} from '@/components/cp/CPHomeSections'
import { SITE_DESCRIPTION, SITE_KEYWORDS, SITE_NAME, SITE_URL } from '@/lib/site'

export const metadata: Metadata = {
  title: `${SITE_NAME} | Estudo inteligente para concursos públicos`,
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Questões preditivas, edital e IA por banca`,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: '/course-icons/logo.png',
        width: 512,
        height: 512,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: ['/course-icons/logo.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
    },
  },
}

export default function HomePage() {
  return (
    <>
      <HomeJsonLd />
      <CPHero />
      <div className="cp-container-wide relative z-10">
        <StatsStrip />
        <HowItWorks />
        <FeaturedCourses />
        <CtaBanner />
        <HomeFaq />
      </div>
      <HomeCourseChatbot />
    </>
  )
}
