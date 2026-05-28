import { useState } from 'react'
import { ArrowPathRoundedSquareIcon } from '@heroicons/react/24/outline'
import FlashcardItem from './FlashcardItem'
import { useSearchParams } from 'react-router-dom'

const FlashcardList = ({
  cards,
  currentIndex,
  onSelect,
  onToggleFavorite,
  onRateDifficulty = null,
  favorites,
  cardProgress = {},
  onPrev,
  onNext,
  onShuffle,
  viewedIds,
  showRating = false,
  onExplainCard = null,
  onDeleteFlashcard = null,
  onEditFlashcard = null,
}) => {
  const [searchParams] = useSearchParams()
  const visited = viewedIds || []
  const currentCard = cards[currentIndex]
  
  const [cardColor, setCardColor] = useState('bg-white')
  const [textColor, setTextColor] = useState('text-slate-900')
  const [borderColor, setBorderColor] = useState('border-white')
  const [showColorPicker, setShowColorPicker] = useState(false)

  const disciplina = decodeURIComponent(searchParams.get('disciplina') || '')
  const modulo = decodeURIComponent(searchParams.get('modulo') || '')

  const colorOptions = [
    { name: 'Branco Padrão', bg: 'bg-white', text: 'text-slate-900', border: 'border-white' },
    { name: 'Cinza Claro', bg: 'bg-slate-100', text: 'text-slate-900', border: 'border-slate-200' },
    { name: 'Cinza Médio', bg: 'bg-slate-200', text: 'text-slate-900', border: 'border-slate-300' },
    { name: 'Cinza Escuro', bg: 'bg-slate-700', text: 'text-white', border: 'border-slate-600' },
    { name: 'Preto', bg: 'bg-slate-900', text: 'text-white', border: 'border-slate-800' },
    { name: 'Azul Claro', bg: 'bg-blue-50', text: 'text-slate-900', border: 'border-blue-100' },
    { name: 'Azul Escuro', bg: 'bg-blue-900', text: 'text-white', border: 'border-blue-800' },
    { name: 'Verde Claro', bg: 'bg-green-50', text: 'text-slate-900', border: 'border-green-100' },
    { name: 'Verde Escuro', bg: 'bg-green-900', text: 'text-white', border: 'border-green-800' },
    { name: 'Roxo Claro', bg: 'bg-purple-50', text: 'text-slate-900', border: 'border-purple-100' },
    { name: 'Roxo Escuro', bg: 'bg-purple-900', text: 'text-white', border: 'border-purple-800' },
  ]

  const handleColorChange = (option) => {
    setCardColor(option.bg)
    setTextColor(option.text)
    setBorderColor(option.border)
    setShowColorPicker(false)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full space-y-4 sm:space-y-6 px-4 sm:px-0">
      {/* Botões de ação no topo */}
      <div className="fixed top-4 right-4 z-50 flex gap-2">
        <button
          type="button"
          onClick={() => {
            const searchQuery = encodeURIComponent(`${disciplina}/${currentCard.pergunta}/${currentCard.resposta} esse flashcard está correto e atualizado?`)
            window.open(`https://www.google.com/search?q=${searchQuery}`, '_blank')
          }}
          className="p-3 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white hover:opacity-80 transition shadow-lg"
          title="Pesquisar no Google"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setShowColorPicker(!showColorPicker)}
          className="p-3 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white hover:opacity-80 transition shadow-lg"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
        </button>
        
        {showColorPicker && (
          <div className="absolute top-14 right-0 bg-white dark:bg-slate-800 rounded-lg shadow-2xl p-3 z-[100] w-64">
            <div className="grid grid-cols-2 gap-2">
              {colorOptions.map((option) => (
                <button
                  key={option.name}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleColorChange(option)
                  }}
                  className={`p-3 rounded-lg ${option.bg} ${option.text} text-xs font-medium hover:opacity-80 transition border border-slate-200 dark:border-slate-600`}
                >
                  {option.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Card Principal */}
      {currentCard && (
        <div className="w-full h-full flex flex-col justify-center items-center space-y-4 sm:space-y-6 max-w-7xl mx-auto">
          <div className="w-full flex justify-center items-center min-h-0 px-2 sm:px-0">
            <FlashcardItem
              card={currentCard}
              isFavorite={favorites.includes(currentCard.id)}
              onToggleFavorite={onToggleFavorite}
              onRateDifficulty={onRateDifficulty}
              showRating={showRating}
              cardProgress={cardProgress && cardProgress[currentCard.id] ? cardProgress[currentCard.id] : null}
              onExplainCard={onExplainCard}
              onDeleteFlashcard={onDeleteFlashcard}
              onEditFlashcard={onEditFlashcard}
              cardColor={cardColor}
              textColor={textColor}
              borderColor={borderColor}
            />
          </div>
          
          {/* Navegação - Melhorada para mobile */}
          <div className="flex items-center justify-center gap-2 sm:gap-4 px-2 sm:px-4 pb-2 sm:pb-0">
            <button
              type="button"
              onClick={onPrev}
              className="group/btn relative inline-flex items-center justify-center gap-1 sm:gap-2 rounded-lg bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-white px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-bold text-slate-900 dark:text-white shadow-lg hover:scale-105 transition-all overflow-hidden min-w-[80px] sm:min-w-[100px]"
            >
              <span className="relative z-10">←</span>
              <span className="relative z-10 hidden sm:inline">Anterior</span>
            </button>
            
            <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-bold text-slate-900 dark:text-white px-2">
              <span>{currentIndex + 1}</span>
              <span>/</span>
              <span>{cards.length}</span>
            </div>
            
            <button
              type="button"
              onClick={onNext}
              className="group/btn relative inline-flex items-center justify-center gap-1 sm:gap-2 rounded-lg bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-white px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-bold text-slate-900 dark:text-white shadow-lg hover:scale-105 transition-all overflow-hidden min-w-[80px] sm:min-w-[100px]"
            >
              <span className="relative z-10 hidden sm:inline">Próximo</span>
              <span className="relative z-10">→</span>
            </button>
          </div>
        </div>
      )}
      
      {/* Grid de mini cards - Tech */}
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 sm:gap-3">
        {cards.map((card, index) => {
          const isFavoriteCard = favorites.includes(card.id)
          const progress = cardProgress && cardProgress[card.id] ? cardProgress[card.id] : null
          const isReviewed = progress && progress.nextReview
          const isCurrent = index === currentIndex
          const isVisited = visited.includes(card.id)
          
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onSelect(index)}
              className={`group relative rounded border-2 px-2 py-2.5 text-xs font-bold transition-all overflow-hidden ${
                isCurrent
                  ? 'border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-lg scale-110 z-10'
                  : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white hover:border-slate-900 dark:hover:border-white'
              } ${isVisited ? 'opacity-100' : 'opacity-60'}`}
            >
              <div className="relative z-10 flex flex-col items-center gap-1">
                <span className="font-black">#{index + 1}</span>
                {isReviewed && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400">✓</span>
                )}
                {isFavoriteCard && (
                  <span className="text-[10px] text-rose-500">♥</span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default FlashcardList
