import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'FlashConCards - Flashcards para Concursos Públicos | Polícia Militar, PMGO, PC',
  description: 'Plataforma de flashcards para concursos públicos. Estude para Polícia Militar, PMGO, PC, GCM e muito mais.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
