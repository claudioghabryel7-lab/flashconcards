'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { verifyShareToken } from '../../../utils/shareToken'
import { fetchFlashcardsForTopico } from '../../../services/topicoFlashcardsService'
import SharedFlashcardPIP from '../../../components/SharedFlashcardPIP'

export default function ShareFlashcardsPage() {
  const params = useParams()
  const [loading, setLoading] = useState(true)
  const [valid, setValid] = useState(false)
  const [expired, setExpired] = useState(false)
  const [flashcards, setFlashcards] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    const loadFlashcards = async () => {
      try {
        const token = params.token
        if (!token) {
          setError('Token inválido')
          setLoading(false)
          return
        }

        const data = verifyShareToken(token)
        
        if (!data) {
          setExpired(true)
          setLoading(false)
          return
        }

        setValid(true)
        
        // Buscar flashcards
        const cards = await fetchFlashcardsForTopico(
          data.courseId,
          data.disciplina,
          data.modulo,
          data.topicKey
        )
        
        if (cards.length === 0) {
          setError('Nenhum flashcard encontrado')
        } else {
          setFlashcards(cards)
        }
      } catch (err) {
        console.error('Erro ao carregar flashcards:', err)
        setError('Erro ao carregar flashcards')
      } finally {
        setLoading(false)
      }
    }

    loadFlashcards()
  }, [params.token])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent mx-auto mb-4"></div>
          <p>Carregando flashcards...</p>
        </div>
      </div>
    )
  }

  if (expired) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-12 text-center max-w-md">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">⏰ Link Expirado</h2>
          <p className="text-xl text-slate-700 mb-6">Este link expirou após 1 hora de uso.</p>
          <p className="text-lg text-slate-600 mb-8">Adquira o curso e tenha acesso completo a todos os flashcards!</p>
          <a
            href="/cursos"
            className="inline-block px-8 py-4 bg-slate-900 text-white rounded-lg font-bold hover:opacity-80 transition"
          >
            Ver Cursos
          </a>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-12 text-center max-w-md">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">❌ Erro</h2>
          <p className="text-xl text-slate-700">{error}</p>
        </div>
      </div>
    )
  }

  if (!valid) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-12 text-center max-w-md">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">🔒 Link Inválido</h2>
          <p className="text-xl text-slate-700 mb-6">Este link não é válido.</p>
          <p className="text-lg text-slate-600 mb-8">Adquira o curso e tenha acesso completo a todos os flashcards!</p>
          <a
            href="/cursos"
            className="inline-block px-8 py-4 bg-slate-900 text-white rounded-lg font-bold hover:opacity-80 transition"
          >
            Ver Cursos
          </a>
        </div>
      </div>
    )
  }

  return <SharedFlashcardPIP flashcards={flashcards} />
}
