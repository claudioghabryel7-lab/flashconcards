import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import FlashcardList from '../components/FlashcardList'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'

const seedFlashcards = [
  {
    id: 'lei-1',
    pergunta: 'Qual é a finalidade principal da Lei 18.884/2015?',
    resposta: 'Reestruturar o Quadro de Pessoal da ALEGO.',
    explicacao:
      'A lei organiza cargos, atribuições e requisitos da Polícia Legislativa.',
    referencia: 'Lei 18.884/2015, art. 1º',
    categoria: 'Lei 18.884/2015',
    tags: ['estrutura', 'polícia legislativa'],
  },
  {
    id: 'lei-2',
    pergunta: 'Quem compõe a Polícia Legislativa da ALEGO?',
    resposta: 'Servidores efetivos investidos em cargos específicos.',
    explicacao:
      'Somente servidores concursados podem atuar como policiais legislativos.',
    referencia: 'Lei 18.884/2015, art. 3º',
    categoria: 'Lei 18.884/2015',
    tags: ['investidura', 'servidores'],
  },
  {
    id: 'lei-3',
    pergunta: 'Quais são os poderes da Polícia Legislativa dentro da ALEGO?',
    resposta: 'Atos de polícia ostensiva e de segurança institucional.',
    explicacao:
      'A corporação protege parlamentares, servidores e o patrimônio legislativo.',
    referencia: 'Lei 18.884/2015, art. 4º',
    categoria: 'Lei 18.884/2015',
    tags: ['competências', 'segurança'],
  },
  {
    id: 'lei-4',
    pergunta: 'Como se dá o ingresso na carreira de Policial Legislativo?',
    resposta: 'Por concurso público de provas ou provas e títulos.',
    explicacao:
      'O ingresso exige aprovação em concurso e cumprimento de requisitos legais.',
    referencia: 'Lei 18.884/2015, art. 11',
    categoria: 'Lei 18.884/2015',
    tags: ['concurso', 'ingresso'],
  },
  {
    id: 'lei-5',
    pergunta: 'Qual é a jornada de trabalho prevista para o cargo?',
    resposta: '40 horas semanais, com regime especial.',
    explicacao:
      'O regime considera escalas e plantões compatíveis com a segurança.',
    referencia: 'Lei 18.884/2015, art. 18',
    categoria: 'Lei 18.884/2015',
    tags: ['jornada', 'plantão'],
  },
  {
    id: 'reg-1',
    pergunta:
      'Quem é responsável por deliberar sobre a criação da Polícia Legislativa?',
    resposta: 'A Mesa Diretora da ALEGO.',
    explicacao:
      'O Regimento Interno atribui à Mesa decisões administrativas estratégicas.',
    referencia: 'Regimento Interno ALEGO, art. 24',
    categoria: 'Regimento Interno',
    tags: ['mesa diretora', 'competência'],
  },
  {
    id: 'reg-2',
    pergunta: 'O que ocorre em caso de infração dentro das dependências da ALEGO?',
    resposta: 'A Polícia Legislativa atua de forma imediata.',
    explicacao:
      'Ela possui competência para restabelecer a ordem e comunicar autoridades.',
    referencia: 'Regimento Interno ALEGO, art. 38',
    categoria: 'Regimento Interno',
    tags: ['disciplina', 'ordem'],
  },
  {
    id: 'reg-3',
    pergunta: 'Como o Regimento trata o acesso do público às sessões?',
    resposta: 'Permite acesso, resguardadas as normas de segurança.',
    explicacao:
      'A Polícia Legislativa controla o ingresso e permanência do público.',
    referencia: 'Regimento Interno ALEGO, art. 140',
    categoria: 'Regimento Interno',
    tags: ['acesso', 'público'],
  },
  {
    id: 'reg-4',
    pergunta: 'Quem decide sobre credenciais permanentes?',
    resposta: 'A Mesa Diretora, com execução da Polícia Legislativa.',
    explicacao:
      'A concessão depende de critérios estabelecidos e controle permanente.',
    referencia: 'Regimento Interno ALEGO, art. 143',
    categoria: 'Regimento Interno',
    tags: ['credenciamento', 'controle'],
  },
  {
    id: 'reg-5',
    pergunta: 'Quais medidas podem ser tomadas contra perturbações em plenário?',
    resposta: 'Retirada do responsável e comunicação às autoridades.',
    explicacao:
      'A Polícia Legislativa garante o bom andamento das sessões.',
    referencia: 'Regimento Interno ALEGO, art. 145',
    categoria: 'Regimento Interno',
    tags: ['plenário', 'disciplina'],
  },
]

const FlashcardView = () => {
  const { favorites, updateFavorites } = useAuth()
  const [cards, setCards] = useState(seedFlashcards)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [filter, setFilter] = useState('all')
  const [viewed, setViewed] = useState([])

  useEffect(() => {
    const cardsRef = collection(db, 'flashcards')
    const q = query(cardsRef, orderBy('pergunta', 'asc'))
    const unsub = onSnapshot(q, (snapshot) => {
      if (snapshot.size === 0) {
        setCards(seedFlashcards)
        return
      }
      const data = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }))
      setCards(data)
    })
    return () => unsub()
  }, [])

  const filteredCards = useMemo(() => {
    if (filter === 'favorite') {
      return cards.filter((card) => favorites.includes(card.id))
    }
    if (filter === 'new') {
      return cards.filter((card) => !viewed.includes(card.id))
    }
    return cards
  }, [cards, favorites, filter, viewed])

  useEffect(() => {
    setCurrentIndex(0)
  }, [filter])

  useEffect(() => {
    if (currentIndex >= filteredCards.length) {
      setCurrentIndex(0)
    }
  }, [filteredCards, currentIndex])

  useEffect(() => {
    const currentCard = filteredCards[currentIndex]
    if (!currentCard) return
    setViewed((prev) =>
      prev.includes(currentCard.id) ? prev : [...prev, currentCard.id],
    )
  }, [filteredCards, currentIndex])

  const goNext = () => {
    setCurrentIndex((prev) =>
      prev + 1 >= filteredCards.length ? 0 : prev + 1,
    )
  }

  const goPrev = () => {
    setCurrentIndex((prev) =>
      prev - 1 < 0 ? filteredCards.length - 1 : prev - 1,
    )
  }

  const toggleFavorite = async (id) => {
    const nextFavorites = favorites.includes(id)
      ? favorites.filter((fav) => fav !== id)
      : [...favorites, id]
    await updateFavorites(nextFavorites)
  }

  const shuffle = () => {
    setCards((prev) => [...prev].sort(() => Math.random() - 0.5))
    setCurrentIndex(0)
  }

  return (
    <section className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-alego-500">
          Estudo ativo
        </p>
        <h1 className="mt-2 text-3xl font-bold text-alego-700">
          Flashcards com animação e filtros inteligentes
        </h1>
      </div>

      {filteredCards.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm">
          Nenhum card neste filtro. Ajuste os filtros ou importe novos cards no
          painel admin.
        </div>
      ) : (
        <FlashcardList
          cards={filteredCards}
          currentIndex={currentIndex}
          onSelect={setCurrentIndex}
          onToggleFavorite={toggleFavorite}
          favorites={favorites}
          filter={filter}
          setFilter={setFilter}
          onPrev={goPrev}
          onNext={goNext}
          onShuffle={shuffle}
          viewedIds={viewed}
        />
      )}
    </section>
  )
}

export default FlashcardView

