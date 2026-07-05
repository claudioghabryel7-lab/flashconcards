import '@/lib/import-meta-env.js'
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import Providers from './providers'
import AppShell from '@/components/cp/AppShell'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Concurseiro Preditivo | Estudo inteligente para concursos',
  description:
    'Plataforma preditiva de estudos para concursos públicos com IA, edital verticalizado, flashcards e questões personalizadas por banca.',
  applicationName: 'Concurseiro Preditivo',
  icons: {
    icon: [{ url: '/course-icons/logo.png', type: 'image/png' }],
    shortcut: '/course-icons/logo.png',
    apple: '/course-icons/logo.png',
  },
  manifest: '/manifest.json',
}

export const dynamic = 'force-dynamic'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full bg-cp-bg text-cp-text antialiased" suppressHydrationWarning>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  )
}
