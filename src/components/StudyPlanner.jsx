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
  CpuChipIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ListBulletIcon,
} from '@heroicons/react/24/outline'
import { motion } from 'framer-motion'
import { useDarkMode } from '../hooks/useDarkMode'
import { useNavigate } from 'react-router-dom'

const StudyPlanner = ({ 
  dailyRecommendation, 
  loading, 
  daysRemaining,
  refreshRecommendation,
  markTopicAsCompleted,
  completedTopics,
  totalTopics,
  resetEditalProgress
}) => {
  const { darkMode } = useDarkMode()
  const navigate = useNavigate()
  const [completedActivities, setCompletedActivities] = useState(new Set())
  const [isMarkingCompleted, setIsMarkingCompleted] = useState(false)

  // Sempre mostrar o planejador, mesmo em loading, para melhor UX
  // if (!dailyRecommendation && !loading) {
  //   return null
  // }

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
        return 'bg-red-500/10 text-red-400 border-red-500/30 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
      case 'media':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800'
      case 'baixa':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800'
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/30 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
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
      <div className="bg-slate-900 dark:bg-slate-950 border border-slate-800 dark:border-slate-900 rounded-xl sm:rounded-2xl shadow-2xl p-4 sm:p-6 md:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
            <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
              <CpuChipIcon className="h-5 w-5 sm:h-6 sm:w-6 text-cyan-400" />
            </div>
            <h2 className="text-lg sm:text-2xl md:text-3xl font-black text-slate-100 dark:text-white break-words">Planejador de Estudos</h2>
            <div className="ml-auto">
              <button
                onClick={resetEditalProgress}
                className="px-3 py-1.5 bg-red-600/20 border border-red-500/30 text-red-400 rounded-lg font-semibold text-xs transition-colors font-mono hover:bg-red-600/30"
              >
                Reset Progress
              </button>
            </div>
          </div>

          {/* Barra de Progresso do Edital */}
          {totalTopics > 0 && (
            <div className="bg-slate-800/50 dark:bg-slate-900/50 border border-slate-700 dark:border-slate-800 rounded-lg p-3 mb-4 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-300 dark:text-slate-400">Progresso do Edital</span>
                <span className="text-sm font-mono text-cyan-400">
                  {completedTopics?.size || 0} / {totalTopics}
                </span>
              </div>
              <div className="w-full bg-slate-700 dark:bg-slate-800 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${totalTopics > 0 ? ((completedTopics?.size || 0) / totalTopics) * 100 : 0}%` }}
                ></div>
              </div>
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-600 text-center font-mono">
                {totalTopics > 0 ? Math.round(((completedTopics?.size || 0) / totalTopics) * 100) : 0}% completo
              </div>
            </div>
          )}

          {loading && !dailyRecommendation ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
              <p className="mt-4 text-slate-400">Processando recomendações...</p>
            </div>
          ) : dailyRecommendation ? (
            <>
              {/* Mensagem Motivacional */}
              <div className="bg-slate-800/50 dark:bg-slate-900/50 border border-slate-700 dark:border-slate-800 rounded-lg sm:rounded-xl p-3 sm:p-4 mb-3 sm:mb-4 backdrop-blur-sm">
                <div className="flex items-start gap-2 sm:gap-3">
                  <div className="p-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg flex-shrink-0 mt-0.5 sm:mt-1">
                    <ArrowTrendingUpIcon className="h-4 w-4 sm:h-5 sm:w-5 text-cyan-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-base sm:text-lg font-semibold mb-1 text-slate-100 dark:text-white break-words">{dailyRecommendation.mensagemMotivacional}</p>
                    {dailyRecommendation.conselho && (
                      <p className="text-slate-400 dark:text-slate-500 text-xs sm:text-sm break-words">{dailyRecommendation.conselho}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Foco do Dia */}
              <div className="bg-slate-800/50 dark:bg-slate-900/50 border border-slate-700 dark:border-slate-800 rounded-lg sm:rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                    <ChartBarIcon className="h-4 w-4 text-cyan-400" />
                  </div>
                  <h3 className="font-bold text-base sm:text-lg text-slate-100 dark:text-white">Target Focus</h3>
                </div>
                <p className="text-slate-300 dark:text-slate-400 text-sm sm:text-base break-words font-mono">{dailyRecommendation.focoDoDia}</p>
              </div>

              {/* Edital Verticalizado */}
              <div className="bg-slate-800/50 dark:bg-slate-900/50 border border-slate-700 dark:border-slate-800 rounded-lg sm:rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                    <ListBulletIcon className="h-4 w-4 text-cyan-400" />
                  </div>
                  <h3 className="font-bold text-base sm:text-lg text-slate-100 dark:text-white">Verticalized Edital</h3>
                </div>
                <p className="text-slate-300 dark:text-slate-400 text-sm sm:text-base break-words font-mono mb-3">
                  Acesse o edital verticalizado para uma visão completa do conteúdo programático e acompanhamento do seu progresso.
                </p>
                <button
                  onClick={() => navigate('/edital-verticalizado')}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-semibold text-sm transition-colors font-mono"
                >
                  View Verticalized Edital →
                </button>
              </div>

              {/* Atividades Recomendadas */}
              <div>
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <div className="p-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                    <CpuChipIcon className="h-4 w-4 text-cyan-400" />
                  </div>
                  <h4 className="font-bold text-base sm:text-lg text-slate-100 dark:text-white">Active Tasks</h4>
                </div>
                <div className="space-y-2 sm:space-y-3">
                  {dailyRecommendation.atividades?.map((atividade, index) => {
                    const Icon = BookOpenIcon
                    const colorClass = 'bg-cyan-500/10 border-cyan-500/20'
                    const activityKey = `${atividade.disciplina}::${atividade.topico}`
                    const isCompleted = completedActivities.has(activityKey)

                    return (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.1 }}
                        className="bg-slate-800/50 dark:bg-slate-900/50 border border-slate-700 dark:border-slate-800 rounded-lg sm:rounded-xl p-3 sm:p-4 backdrop-blur-sm"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                          <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
                            <div className={`p-1.5 sm:p-2 rounded-lg ${colorClass} flex-shrink-0`}>
                              <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-cyan-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-1">
                                <h5 className="font-semibold text-slate-100 dark:text-white font-mono text-sm">
                                  {atividade.disciplina}
                                </h5>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getPriorityColor(atividade.prioridade)}`}>
                                  {atividade.prioridade}
                                </span>
                              </div>
                              {atividade.topico && (
                                <p className="text-sm font-medium text-cyan-400 dark:text-cyan-500 mb-1 font-mono">
                                  {atividade.topico}
                                </p>
                              )}
                              <p className="text-sm text-slate-400 dark:text-slate-500 mb-2">
                                {atividade.descricao}
                              </p>
                              {atividade.dica && (
                                <p className="text-xs text-slate-500 dark:text-slate-600 italic mb-2 font-mono">
                                  💡 {atividade.dica}
                                </p>
                              )}
                              <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-600">
                                <div className="flex items-center gap-1">
                                  <ClockIcon className="h-4 w-4" />
                                  {atividade.tempoEstimado}
                                </div>
                                <button
                                  onClick={() => goToEdital(atividade.disciplina, atividade.topico)}
                                  className="text-cyan-400 dark:text-cyan-500 hover:underline font-mono"
                                >
                                  View Details →
                                </button>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleMarkAsCompleted(atividade)}
                            disabled={isMarkingCompleted || isCompleted}
                            className={`px-4 py-2 text-white rounded-lg font-semibold transition-colors text-sm whitespace-nowrap font-mono ${
                              isCompleted
                                ? 'bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 cursor-not-allowed'
                                : 'bg-cyan-600 hover:bg-cyan-700 border border-cyan-500'
                            } disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2`}
                          >
                            {isCompleted ? (
                              <>
                                <CheckCircleIcon className="h-4 w-4" />
                                Complete
                              </>
                            ) : (
                              'Execute'
                            )}
                          </button>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            </>
          ) : loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
              <p className="mt-4 text-slate-400">Atualizando sistema...</p>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-slate-400">Inicializando planejador...</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export default StudyPlanner

