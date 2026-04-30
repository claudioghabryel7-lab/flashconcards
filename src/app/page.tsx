'use client'

import { useEffect } from 'react'
import SimpleHeader from '@/components/SimpleHeader'
import SimpleHero from '@/components/SimpleHero'
import Footer from '@/components/Footer'
import { app, analytics } from '@/lib/firebase'
import { testGeminiAPI } from '@/lib/gemini'

export default function Home() {
  useEffect(() => {
    // Initialize Firebase when component mounts
    console.log('Firebase initialized:', app)
    console.log('Analytics initialized:', analytics)
    
    // Testar Gemini 3.0 API
    testGeminiAPI()
  }, [])

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <SimpleHeader />
      <SimpleHero />
      <Footer />
    </div>
  )
}
