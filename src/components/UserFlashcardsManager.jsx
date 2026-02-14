import { useState, useEffect } from 'react'
import { PlusIcon, PencilIcon, EyeIcon, ClockIcon, CheckCircleIcon, XCircleIcon, ArrowDownTrayIcon, BugAntIcon, PlayIcon } from '@heroicons/react/24/outline'
import { userFlashcardsService } from '../services/userFlashcardsService'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import AnkiExportButton from './AnkiExportButton'
import { debugFlashcards } from '../utils/debugFlashcards'
import { testDownload } from '../utils/testDownload'

const UserFlashcardsManager = ({ selectedCourseId = null }) => {
  const { user, profile } = useAuth()
  const { darkMode } = useDarkMode()
  const [flashcards, setFlashcards] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingCard, setEditingCard] = useState(null)
  const [filters, setFilters] = useState({
    materia: '',
    modulo: '',
    status: '',
    search: ''
  })
  const [stats, setStats] = useState(null)

  // Form data
  const [formData, setFormData] = useState({
    pergunta: '',
    resposta: '',
    materia: 'Geral',
    modulo: 'Geral',
    dificuldade: 'média',
    tags: []
  })

  // Matérias disponíveis
  const materias = [
    'Geral',
    'Português',
    'Área de Atuação (PL)',
    'Raciocínio Lógico',
    'Constitucional',
    'Administrativo',
    'Legislação Estadual',
    'Realidade de Goiás',
    'Redação'
  ]

  const dificuldades = ['fácil', 'média', 'difícil']

  useEffect(() => {
    if (!user) return

    const unsubscribe = userFlashcardsService.subscribeToUserFlashcards(
      user.uid,
      (cards) => {
        setFlashcards(cards)
        setLoading(false)
      },
      filters
    )

    // Carregar estatísticas
    loadStats()

    return () => unsubscribe()
  }, [user, filters])

  const loadStats = async () => {
    if (!user) return
    try {
      const userStats = await userFlashcardsService.getUserFlashcardsStats(user.uid)
      setStats(userStats)
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!user) return

    try {
      if (editingCard) {
        await userFlashcardsService.updateFlashcard(editingCard.id, formData)
      } else {
        await userFlashcardsService.createFlashcard(user.uid, formData)
      }

      resetForm()
      loadStats()
    } catch (error) {
      console.error('Erro ao salvar flashcard:', error)
      alert('Erro ao salvar flashcard. Tente novamente.')
    }
  }

  const handleEdit = (card) => {
    setEditingCard(card)
    setFormData({
      pergunta: card.pergunta,
      resposta: card.resposta,
      materia: card.materia,
      modulo: card.modulo,
      dificuldade: card.dificuldade,
      tags: card.tags || []
    })
    setShowForm(true)
  }

  const resetForm = () => {
    setFormData({
      pergunta: '',
      resposta: '',
      materia: 'Geral',
      modulo: 'Geral',
      dificuldade: 'média',
      tags: []
    })
    setEditingCard(null)
    setShowForm(false)
  }

  const filteredFlashcards = flashcards.filter(card => {
    if (filters.search && !card.pergunta.toLowerCase().includes(filters.search.toLowerCase()) &&
        !card.resposta.toLowerCase().includes(filters.search.toLowerCase())) {
      return false
    }
    return true
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-alego-600 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          Meus Flashcards
        </h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-alego-600 text-white rounded-lg hover:bg-alego-700 transition-colors"
        >
          <PlusIcon className="h-5 w-5" />
          Novo Flashcard
        </button>
      </div>

      {/* Estatísticas */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <EyeIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Total</p>
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.total}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                <ClockIcon className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Para Revisar Hoje</p>
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.dueToday}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <CheckCircleIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Dominados</p>
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{stats.byStatus.mastered}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <ArrowDownTrayIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Exportar</p>
                <p className="text-lg font-bold text-slate-800 dark:text-slate-100">Anki</p>
              </div>
            </div>
            <div className="mt-3">
              <AnkiExportButton 
                selectedMateria={filters.materia || null}
                selectedModulo={filters.modulo || null}
                selectedCourseId={selectedCourseId}
                className="w-full"
                variant="secondary"
              />
            </div>
            <div className="mt-2">
              <button
                onClick={debugFlashcards}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium text-xs bg-red-600 hover:bg-red-700 text-white transition-all duration-200"
                title="Debug: Verificar flashcards no banco"
              >
                <BugAntIcon className="h-4 w-4" />
                <span>Debug Flashcards</span>
              </button>
            </div>
            <div className="mt-2">
              <button
                onClick={testDownload}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium text-xs bg-purple-600 hover:bg-purple-700 text-white transition-all duration-200"
                title="Testar download de arquivo"
              >
                <PlayIcon className="h-4 w-4" />
                <span>Testar Download</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Buscar flashcards..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
          />

          <select
            value={filters.materia}
            onChange={(e) => setFilters({ ...filters, materia: e.target.value })}
            className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
          >
            <option value="">Todas as matérias</option>
            {materias.map(materia => (
              <option key={materia} value={materia}>{materia}</option>
            ))}
          </select>

          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
          >
            <option value="">Todos os status</option>
            <option value="new">Novos</option>
            <option value="learning">Aprendendo</option>
            <option value="review">Revisão</option>
            <option value="mastered">Dominados</option>
          </select>
        </div>
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">
              {editingCard ? 'Editar Flashcard' : 'Novo Flashcard'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Pergunta
                </label>
                <textarea
                  required
                  value={formData.pergunta}
                  onChange={(e) => setFormData({ ...formData, pergunta: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                  rows={3}
                  placeholder="Digite a pergunta..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Resposta
                </label>
                <textarea
                  required
                  value={formData.resposta}
                  onChange={(e) => setFormData({ ...formData, resposta: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                  rows={3}
                  placeholder="Digite a resposta..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Matéria
                  </label>
                  <select
                    value={formData.materia}
                    onChange={(e) => setFormData({ ...formData, materia: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                  >
                    {materias.map(materia => (
                      <option key={materia} value={materia}>{materia}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Módulo
                  </label>
                  <input
                    type="text"
                    value={formData.modulo}
                    onChange={(e) => setFormData({ ...formData, modulo: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                    placeholder="Nome do módulo"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Dificuldade
                  </label>
                  <select
                    value={formData.dificuldade}
                    onChange={(e) => setFormData({ ...formData, dificuldade: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                  >
                    {dificuldades.map(dificuldade => (
                      <option key={dificuldade} value={dificuldade}>
                        {dificuldade.charAt(0).toUpperCase() + dificuldade.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-alego-600 text-white rounded-lg hover:bg-alego-700 transition-colors"
                >
                  {editingCard ? 'Atualizar' : 'Criar'} Flashcard
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista de Flashcards */}
      <div className="space-y-4">
        {filteredFlashcards.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-lg shadow">
            <p className="text-slate-600 dark:text-slate-400">
              {flashcards.length === 0 
                ? 'Você ainda não criou nenhum flashcard. Crie seu primeiro flashcard!' 
                : 'Nenhum flashcard encontrado com os filtros selecionados.'}
            </p>
          </div>
        ) : (
          filteredFlashcards.map(card => (
            <div key={card.id} className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-1 bg-alego-100 dark:bg-alego-900 text-alego-700 dark:text-alego-300 text-xs rounded-full">
                      {card.materia}
                    </span>
                    <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-xs rounded-full">
                      {card.modulo}
                    </span>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      card.dificuldade === 'fácil' ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' :
                      card.dificuldade === 'média' ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300' :
                      'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
                    }`}>
                      {card.dificuldade}
                    </span>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      card.srsData.status === 'new' ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' :
                      card.srsData.status === 'learning' ? 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300' :
                      card.srsData.status === 'review' ? 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300' :
                      'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                    }`}>
                      {card.srsData.status === 'new' ? 'Novo' :
                       card.srsData.status === 'learning' ? 'Aprendendo' :
                       card.srsData.status === 'review' ? 'Revisão' : 'Dominado'}
                    </span>
                  </div>
                  
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
                    {card.pergunta}
                  </h3>
                  
                  <p className="text-slate-600 dark:text-slate-400 mb-2">
                    {card.resposta}
                  </p>

                  <div className="text-xs text-slate-500 dark:text-slate-500">
                    Próxima revisão: {new Date(card.srsData.nextReviewDate).toLocaleDateString('pt-BR')}
                  </div>
                </div>

                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleEdit(card)}
                    className="p-2 text-slate-600 dark:text-slate-400 hover:text-alego-600 dark:hover:text-alego-400"
                  >
                    <PencilIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default UserFlashcardsManager
