import { useState } from 'react'
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { userFlashcardsService } from '../services/userFlashcardsService'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'

const AddUserFlashcardButton = ({ selectedMateria, selectedModulo, selectedCourseId, onFlashcardAdded }) => {
  const { user } = useAuth()
  const { darkMode } = useDarkMode()
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    pergunta: '',
    resposta: '',
    materia: selectedMateria || 'Geral',
    modulo: selectedModulo || 'Geral',
    dificuldade: 'fácil'
  })
  const [loading, setLoading] = useState(false)

  const materias = [
    'Geral',
    'Português',
    'Área de Atuação (PL)',
    'Raciocínio Lógico',
    'Constitucional',
    'Administrativo',
    'Legislação Estadual',
    'Realidade de Goiás',
    'Redação',
    'DIREITO PENAL',
    'DIREITO PENAL MILITAR',
    'DIREITO PROCESSUAL PENAL',
    'DIREITO CONSTITUCIONAL',
    'DIREITO ADMINISTRATIVO'
  ]

  const dificuldades = ['fácil', 'difícil']

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!user) return

    setLoading(true)
    try {
      await userFlashcardsService.createFlashcard(user.uid, {
        ...formData,
        courseId: selectedCourseId || null
      })

      // Resetar formulário
      setFormData({
        pergunta: '',
        resposta: '',
        materia: selectedMateria || 'Geral',
        modulo: selectedModulo || 'Geral',
        dificuldade: 'fácil'
      })

      setShowForm(false)
      
      // Notificar componente pai
      if (onFlashcardAdded) {
        onFlashcardAdded()
      }
    } catch (error) {
      console.error('Erro ao criar flashcard:', error)
      alert('Erro ao criar flashcard. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setShowForm(false)
    setFormData({
      pergunta: '',
      resposta: '',
      materia: selectedMateria || 'Geral',
      modulo: selectedModulo || 'Geral',
      dificuldade: 'fácil'
    })
  }

  return (
    <>
      {/* Botão Flutuante */}
      <button
        onClick={() => setShowForm(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-alego-600 hover:bg-alego-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 z-40"
        title="Adicionar Flashcard"
      >
        <PlusIcon className="h-6 w-6" />
      </button>

      {/* Modal/Formulário */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                Novo Flashcard
              </h3>
              <button
                onClick={handleClose}
                className="p-1 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Formulário */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Pergunta *
                </label>
                <textarea
                  required
                  value={formData.pergunta}
                  onChange={(e) => setFormData({ ...formData, pergunta: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 resize-none"
                  rows={3}
                  placeholder="Digite a pergunta..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Resposta *
                </label>
                <textarea
                  required
                  value={formData.resposta}
                  onChange={(e) => setFormData({ ...formData, resposta: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 resize-none"
                  rows={3}
                  placeholder="Digite a resposta..."
                />
              </div>

              <div className="grid grid-cols-1 gap-4">
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
                    Módulo/Assunto
                  </label>
                  <input
                    type="text"
                    value={formData.modulo}
                    onChange={(e) => setFormData({ ...formData, modulo: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                    placeholder="Nome do módulo ou assunto"
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

              {/* Indicador visual */}
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  💡 Este flashcard será <strong>seu pessoal</strong> e aparecerá junto com os flashcards do sistema nesta mesma matéria e módulo.
                </p>
              </div>

              {/* Botões */}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading || !formData.pergunta.trim() || !formData.resposta.trim()}
                  className="px-4 py-2 bg-alego-600 text-white rounded-lg hover:bg-alego-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Criando...' : 'Criar Flashcard'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export default AddUserFlashcardButton
