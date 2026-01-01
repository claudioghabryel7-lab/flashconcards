import { useState } from 'react'
import {
  BookOpenIcon,
  QuestionMarkCircleIcon,
  ClipboardDocumentCheckIcon,
  PencilSquareIcon,
  SparklesIcon,
  ClockIcon,
  CheckCircleIcon,
  LightBulbIcon,
} from '@heroicons/react/24/outline'
import { motion } from 'framer-motion'
import { useDarkMode } from '../hooks/useDarkMode'
import { useNavigate } from 'react-router-dom'

const StudyPlanner = ({ 
  dailyRecommendation, 
  loading, 
  daysRemaining,
  refreshRecommendation,
  markTopicAsCompleted
}) => {
  const { darkMode } = useDarkMode()
  const navigate = useNavigate()
  const [completedActivities, setCompletedActivities] = useState(new Set())
  const [isMarkingCompleted, setIsMarkingCompleted] = useState(false)

  if (!dailyRecommendation && !loading) {
    return null
  }

  const getActivityIcon = (tipo) => {
    switch (tipo) {
      case 'flashcards':
        return BookOpenIcon
      case 'questoes':
        return QuestionMarkCircleIcon
      case 'simulado':
        return ClipboardDocumentCheckIcon
      case 'redacao':
        return PencilSquareIcon
      case 'mapas':
        return SparklesIcon
      default:
        return BookOpenIcon
    }
  }

  const getActivityColor = (tipo) => {
    switch (tipo) {
      case 'flashcards':
        return 'from-blue-500 to-blue-600'
      case 'questoes':
        return 'from-green-500 to-green-600'
      case 'simulado':
        return 'from-purple-500 to-purple-600'
      case 'redacao':
        return 'from-orange-500 to-orange-600'
      case 'mapas':
        return 'from-pink-500 to-pink-600'
      default:
        return 'from-gray-500 to-gray-600'
    }
  }

  const getPriorityColor = (prioridade) => {
    switch (prioridade) {
      case 'alta':
        return 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700'
      case 'media':
        return 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700'
      case 'baixa':
        return 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700'
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600'
    }
  }

  const handleMarkAsCompleted = async (atividade) => {
    if (!markTopicAsCompleted || completedActivities.has(`${atividade.disciplina}::${atividade.topico}`)) {
      return
    }

    setIsMarkingCompleted(true)

    try {
      const success = await markTopicAsCompleted(
        atividade.disciplina,
        atividade.topico
      )

      if (success) {
        const activityKey = `${atividade.disciplina}::${atividade.topico}`
        const newCompleted = new Set([...completedActivities, activityKey])
        setCompletedActivities(newCompleted)

        // Verificar se TODAS as atividades foram concluídas
        const allActivities = dailyRecommendation?.atividades || []
        const allKeys = allActivities.map(a => `${a.disciplina}::${a.topico}`)
        const totalActivities = allKeys.length
        const completedCount = newCompleted.size
        
        // Verificação rigorosa: todas as chaves devem estar no conjunto de completas
        const allKeysCompleted = allKeys.length > 0 && allKeys.every(key => newCompleted.has(key))
        const allCompleted = totalActivities > 0 && totalActivities === completedCount && allKeysCompleted

        // SÓ atualizar se TODAS foram concluídas
        if (allCompleted) {
          // Aguardar um pouco antes de atualizar para garantir que o estado foi atualizado
          setTimeout(() => {
            // Disparar evento para atualizar o planejador
            window.dispatchEvent(new CustomEvent('studyPlannerRefresh'))
            
            // Atualizar recomendação após um pequeno delay
            setTimeout(() => {
              refreshRecommendation()
              setCompletedActivities(new Set())
            }, 300)
          }, 200)
        }
        // Se não foram todas concluídas, NÃO faz nada - apenas marca localmente como concluído
      }
    } catch (error) {
      console.error('Erro ao marcar como concluído:', error)
    } finally {
      setIsMarkingCompleted(false)
    }
  }

  const goToEdital = (disciplina, topico) => {
    navigate(`/edital-verticalizado?disciplina=${encodeURIComponent(disciplina)}&topico=${encodeURIComponent(topico)}`)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mb-6 sm:mb-8"
    >
      <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-xl sm:rounded-2xl shadow-xl p-4 sm:p-6 md:p-8 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 sm:w-64 sm:h-64 bg-white/10 rounded-full blur-3xl"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
            <SparklesIcon className="h-6 w-6 sm:h-8 sm:w-8 flex-shrink-0" />
            <h2 className="text-lg sm:text-2xl md:text-3xl font-black break-words">Planejador de Estudos com IA</h2>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
              <p className="mt-4 text-white/80">Gerando recomendações personalizadas...</p>
            </div>
          ) : dailyRecommendation ? (
            <>
              {/* Mensagem Motivacional */}
              <div className="bg-white/10 backdrop-blur-sm rounded-lg sm:rounded-xl p-3 sm:p-4 mb-3 sm:mb-4">
                <div className="flex items-start gap-2 sm:gap-3">
                  <LightBulbIcon className="h-5 w-5 sm:h-6 sm:w-6 text-yellow-300 flex-shrink-0 mt-0.5 sm:mt-1" />
                  <div className="min-w-0 flex-1">
                    <p className="text-base sm:text-lg font-semibold mb-1 break-words">{dailyRecommendation.mensagemMotivacional}</p>
                    {dailyRecommendation.conselho && (
                      <p className="text-white/90 text-xs sm:text-sm break-words">{dailyRecommendation.conselho}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Foco do Dia */}
              <div className="bg-white/10 backdrop-blur-sm rounded-lg sm:rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
                <h3 className="font-bold text-base sm:text-lg mb-2">🎯 Foco de Hoje</h3>
                <p className="text-white/90 text-sm sm:text-base break-words">{dailyRecommendation.focoDoDia}</p>
              </div>

              {/* Atividades Recomendadas */}
              <div>
                <h4 className="font-bold text-base sm:text-lg mb-3 sm:mb-4">📚 Atividades Recomendadas</h4>
                <div className="space-y-2 sm:space-y-3">
                  {dailyRecommendation.atividades?.map((atividade, index) => {
                    const Icon = BookOpenIcon
                    const colorClass = 'from-indigo-500 to-purple-600'
                    const activityKey = `${atividade.disciplina}::${atividade.topico}`
                    const isCompleted = completedActivities.has(activityKey)

                    return (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.1 }}
                        className="bg-white dark:bg-slate-800 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-slate-200 dark:border-slate-600"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                          <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
                            <div className={`p-1.5 sm:p-2 rounded-lg bg-gradient-to-br ${colorClass} flex-shrink-0`}>
                              <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-1">
                                <h5 className="font-semibold text-slate-900 dark:text-white">
                                  {atividade.disciplina}
                                </h5>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getPriorityColor(atividade.prioridade)}`}>
                                  {atividade.prioridade}
                                </span>
                              </div>
                              {atividade.topico && (
                                <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 mb-1">
                                  📌 {atividade.topico}
                                </p>
                              )}
                              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                                {atividade.descricao}
                              </p>
                              {atividade.dica && (
                                <p className="text-xs text-slate-500 dark:text-slate-500 italic mb-2">
                                  💡 {atividade.dica}
                                </p>
                              )}
                              <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                                <div className="flex items-center gap-1">
                                  <ClockIcon className="h-4 w-4" />
                                  {atividade.tempoEstimado}
                                </div>
                                <button
                                  onClick={() => goToEdital(atividade.disciplina, atividade.topico)}
                                  className="text-indigo-600 dark:text-indigo-400 hover:underline"
                                >
                                  Ver no Edital →
                                </button>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleMarkAsCompleted(atividade)}
                            disabled={isMarkingCompleted || isCompleted}
                            className={`px-4 py-2 text-white rounded-lg font-semibold transition-colors text-sm whitespace-nowrap ${
                              isCompleted
                                ? 'bg-green-500 opacity-75 cursor-not-allowed'
                                : 'bg-green-600 hover:bg-green-700'
                            } disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2`}
                          >
                            {isCompleted ? (
                              <>
                                <CheckCircleIcon className="h-4 w-4" />
                                Concluído
                              </>
                            ) : (
                              'Concluir'
                            )}
                          </button>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </motion.div>
  )
}

export default StudyPlanner

