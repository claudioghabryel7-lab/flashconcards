import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, getDoc, collection, addDoc, updateDoc, deleteDoc, query, where, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode'

export default function Flashcards2_0() {
  const { user } = useAuth()
  const { darkMode } = useDarkMode()
  const navigate = useNavigate()

  const [flashcards, setFlashcards] = useState([])
  const [decks, setDecks] = useState([])
  const [currentDeck, setCurrentDeck] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showAddCard, setShowAddCard] = useState(false)
  const [showAddDeck, setShowAddDeck] = useState(false)
  const [newCard, setNewCard] = useState({ pergunta: '', resposta: '', materia: '' })
  const [newDeck, setNewDeck] = useState({ nome: '', descricao: '', materia: '' })
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCard, setSelectedCard] = useState(null)

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }

    // Carregar decks do usuário
    const decksQuery = query(
      collection(db, 'users', user.uid, 'flashcardDecks'),
      orderBy('createdAt', 'desc')
    )

    const unsubscribeDecks = onSnapshot(decksQuery, (snapshot) => {
      const decksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setDecks(decksData)
      setIsLoading(false)
    })

    return () => unsubscribeDecks()
  }, [user, navigate])

  useEffect(() => {
    if (currentDeck) {
      // Carregar flashcards do deck atual
      const cardsQuery = query(
        collection(db, 'users', user.uid, 'flashcardDecks', currentDeck.id, 'cards'),
        orderBy('createdAt', 'desc')
      )

      const unsubscribeCards = onSnapshot(cardsQuery, (snapshot) => {
        const cardsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        setFlashcards(cardsData)
      })

      return () => unsubscribeCards()
    }
  }, [currentDeck, user])

  const createDeck = async () => {
    if (!newDeck.nome.trim()) return

    try {
      const deckRef = await addDoc(collection(db, 'users', user.uid, 'flashcardDecks'), {
        nome: newDeck.nome,
        descricao: newDeck.descricao,
        materia: newDeck.materia,
        cardCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      setNewDeck({ nome: '', descricao: '', materia: '' })
      setShowAddDeck(false)
      setCurrentDeck({ id: deckRef.id, ...newDeck })
    } catch (error) {
      console.error('Erro ao criar deck:', error)
      alert('Erro ao criar deck. Tente novamente.')
    }
  }

  const createCard = async () => {
    if (!newCard.pergunta.trim() || !newCard.resposta.trim()) return

    try {
      await addDoc(collection(db, 'users', user.uid, 'flashcardDecks', currentDeck.id, 'cards'), {
        pergunta: newCard.pergunta,
        resposta: newCard.resposta,
        materia: newCard.materia || currentDeck.materia,
        createdAt: new Date(),
        updatedAt: new Date(),
        reviewCount: 0,
        lastReview: null
      })

      // Atualizar contador do deck
      await updateDoc(doc(db, 'users', user.uid, 'flashcardDecks', currentDeck.id), {
        cardCount: currentDeck.cardCount + 1,
        updatedAt: new Date()
      })

      setNewCard({ pergunta: '', resposta: '', materia: '' })
      setShowAddCard(false)
    } catch (error) {
      console.error('Erro ao criar flashcard:', error)
      alert('Erro ao criar flashcard. Tente novamente.')
    }
  }

  const deleteCard = async (cardId) => {
    if (!confirm('Tem certeza que deseja excluir este flashcard?')) return

    try {
      await deleteDoc(doc(db, 'users', user.uid, 'flashcardDecks', currentDeck.id, 'cards', cardId))
      
      // Atualizar contador do deck
      await updateDoc(doc(db, 'users', user.uid, 'flashcardDecks', currentDeck.id), {
        cardCount: currentDeck.cardCount - 1,
        updatedAt: new Date()
      })
    } catch (error) {
      console.error('Erro ao excluir flashcard:', error)
      alert('Erro ao excluir flashcard. Tente novamente.')
    }
  }

  const filteredFlashcards = flashcards.filter(card =>
    card.pergunta.toLowerCase().includes(searchTerm.toLowerCase()) ||
    card.resposta.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (isLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className={`text-lg ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Carregando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <header className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <h1 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Flashcards
              </h1>
              {currentDeck && (
                <span className={`ml-4 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {currentDeck.nome} ({currentDeck.cardCount} cards)
                </span>
              )}
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowAddDeck(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Novo Deck
              </button>
              {currentDeck && (
                <button
                  onClick={() => setShowAddCard(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Adicionar Card
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar - Decks */}
          <div className="lg:col-span-1">
            <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow p-6`}>
              <h2 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Meus Decks
              </h2>
              <div className="space-y-2">
                {decks.map(deck => (
                  <button
                    key={deck.id}
                    onClick={() => setCurrentDeck(deck)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      currentDeck?.id === deck.id
                        ? 'bg-blue-100 text-blue-700 border border-blue-300'
                        : darkMode
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <div className="font-medium">{deck.nome}</div>
                    <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {deck.cardCount} cards • {deck.materia}
                    </div>
                  </button>
                ))}
                {decks.length === 0 && (
                  <p className={`text-center py-8 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Nenhum deck criado ainda
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Main Content - Flashcards */}
          <div className="lg:col-span-3">
            {currentDeck ? (
              <>
                {/* Search Bar */}
                <div className="mb-6">
                  <input
                    type="text"
                    placeholder="Buscar flashcards..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={`w-full px-4 py-2 rounded-lg border ${
                      darkMode
                        ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-400'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                  />
                </div>

                {/* Flashcards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredFlashcards.map(card => (
                    <div
                      key={card.id}
                      onClick={() => setSelectedCard(card)}
                      className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-all`}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          darkMode ? 'bg-blue-900 text-blue-300' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {card.materia}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteCard(card.id)
                          }}
                          className="text-red-500 hover:text-red-700"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                      <h3 className={`font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {card.pergunta}
                      </h3>
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} line-clamp-3`}>
                        {card.resposta}
                      </p>
                    </div>
                  ))}
                </div>

                {filteredFlashcards.length === 0 && (
                  <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    <p>Nenhum flashcard encontrado</p>
                    <button
                      onClick={() => setShowAddCard(true)}
                      className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      Criar Primeiro Flashcard
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <p>Selecione um deck para começar</p>
                <button
                  onClick={() => setShowAddDeck(true)}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Criar Primeiro Deck
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Add Deck */}
      {showAddDeck && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 w-full max-w-md`}>
            <h2 className={`text-xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Novo Deck
            </h2>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Nome do Deck"
                value={newDeck.nome}
                onChange={(e) => setNewDeck({ ...newDeck, nome: e.target.value })}
                className={`w-full px-4 py-2 rounded-lg border ${
                  darkMode
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                }`}
              />
              <input
                type="text"
                placeholder="Matéria"
                value={newDeck.materia}
                onChange={(e) => setNewDeck({ ...newDeck, materia: e.target.value })}
                className={`w-full px-4 py-2 rounded-lg border ${
                  darkMode
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                }`}
              />
              <textarea
                placeholder="Descrição (opcional)"
                value={newDeck.descricao}
                onChange={(e) => setNewDeck({ ...newDeck, descricao: e.target.value })}
                rows={3}
                className={`w-full px-4 py-2 rounded-lg border ${
                  darkMode
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                }`}
              />
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowAddDeck(false)}
                className={`px-4 py-2 rounded-lg ${
                  darkMode
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Cancelar
              </button>
              <button
                onClick={createDeck}
                disabled={!newDeck.nome.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Criar Deck
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Add Card */}
      {showAddCard && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 w-full max-w-md`}>
            <h2 className={`text-xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Novo Flashcard
            </h2>
            <div className="space-y-4">
              <textarea
                placeholder="Pergunta"
                value={newCard.pergunta}
                onChange={(e) => setNewCard({ ...newCard, pergunta: e.target.value })}
                rows={3}
                className={`w-full px-4 py-2 rounded-lg border ${
                  darkMode
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                }`}
              />
              <textarea
                placeholder="Resposta"
                value={newCard.resposta}
                onChange={(e) => setNewCard({ ...newCard, resposta: e.target.value })}
                rows={4}
                className={`w-full px-4 py-2 rounded-lg border ${
                  darkMode
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                }`}
              />
              <input
                type="text"
                placeholder="Matéria"
                value={newCard.materia}
                onChange={(e) => setNewCard({ ...newCard, materia: e.target.value })}
                className={`w-full px-4 py-2 rounded-lg border ${
                  darkMode
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                }`}
              />
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowAddCard(false)}
                className={`px-4 py-2 rounded-lg ${
                  darkMode
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Cancelar
              </button>
              <button
                onClick={createCard}
                disabled={!newCard.pergunta.trim() || !newCard.resposta.trim()}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Criar Flashcard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Card Detail */}
      {selectedCard && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto`}>
            <div className="flex justify-between items-start mb-4">
              <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Flashcard
              </h2>
              <button
                onClick={() => setSelectedCard(null)}
                className={`text-gray-500 hover:text-gray-700 ${darkMode ? 'text-gray-400 hover:text-gray-200' : ''}`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Pergunta
                </label>
                <p className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-900'}`}>
                  {selectedCard.pergunta}
                </p>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Resposta
                </label>
                <p className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-900'}`}>
                  {selectedCard.resposta}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Matéria: {selectedCard.materia}
                </span>
                <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Revisões: {selectedCard.reviewCount || 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
