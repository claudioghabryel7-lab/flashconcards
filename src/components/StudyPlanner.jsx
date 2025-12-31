import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  AcademicCapIcon,
  BookOpenIcon,
  LightBulbIcon,
  ChartBarIcon,
  ClockIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  SparklesIcon,
  CalendarIcon,
  FireIcon,
  QuestionMarkCircleIcon,
  ClipboardDocumentCheckIcon,
  PencilSquareIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import {
  AcademicCapIcon as AcademicCapSolid,
  BookOpenIcon as BookOpenSolid,
} from '@heroicons/react/24/solid'
import { motion } from 'framer-motion'
import { useDarkMode } from '../hooks/useDarkMode'
import dayjs from 'dayjs'

const StudyPlanner = ({ 
  dailyRecommendation, 
  progressStats, 
  loading, 
  targetDate, 
  metaDays, 
  setMetaDays
}) => {
  const { darkMode } = useDarkMode()
  // Removido expandedActivity não utilizado

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
        return LightBulbIcon
      default:
        return BookOpenIcon
    }
  }

  const getActivityColor = (tipo) => {
    switch (tipo) {
      case 'flashcards':
        return 'from-blue-500 to-blue-600'
      case 'questoes':
        return 'from-purple-500 to-purple-600'
      case 'simulado':
        return 'from-green-500 to-green-600'
      case 'redacao':
        return 'from-pink-500 to-pink-600'
      case 'mapas':
        return 'from-yellow-500 to-yellow-600'
      default:
        return 'from-gray-500 to-gray-600'
    }
  }

  const getActivityLink = (tipo, materia, modulo) => {
    // Validar se matéria e módulo são válidos (não "A DEFINIR" ou vazios)
    const validMateria = materia && materia.trim() !== '' && materia !== 'A DEFINIR'
    const validModulo = modulo && modulo.trim() !== '' && modulo !== 'A DEFINIR'
    
    // Criar parâmetros de query se matéria e módulo estiverem disponíveis
    const params = new URLSearchParams()
    if (validMateria) {
      params.set('materia', materia.trim())
    }
    if (validModulo) {
      params.set('modulo', modulo.trim())
    }
    const queryString = params.toString()
    const query = queryString ? `?${queryString}` : ''
    
    // Log para debug
    if (validMateria && validModulo) {
      console.log('🔗 Gerando link:', tipo, '-', materia, '-', modulo, '→', query)
    } else {
      console.warn('⚠️ Link inválido - matéria ou módulo ausente:', { tipo, materia, modulo })
    }
    
    switch (tipo) {
      case 'flashcards':
        return `/flashcards${query}`
      case 'questoes':
        return `/flashquestoes${query}`
      case 'simulado':
        return '/simulado'
      case 'redacao':
        return '/treino-redacao'
      case 'mapas':
        return '/mapas-mentais'
      default:
        return '/dashboard'
    }
  }

  const getPriorityColor = (prioridade) => {
    switch (prioridade) {
      case 'alta':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700'
      case 'media':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700'
      case 'baixa':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700'
      default:
        return 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300'
    }
  }

  // Recalcular dias restantes diariamente
  const [currentDate, setCurrentDate] = useState(dayjs().format('YYYY-MM-DD'))
  
  useEffect(() => {
    const updateDate = () => {
      const today = dayjs().format('YYYY-MM-DD')
      setCurrentDate(today)
    }
    
    updateDate()
    const interval = setInterval(updateDate, 60000) // Verificar a cada minuto
    
    return () => clearInterval(interval)
  }, [])
  
  // Usar dias restantes da recomendação (atualizado às 06:00) ou calcular localmente
  const daysRemaining = dailyRecommendation?.progressoParaMeta?.diasRestantes !== undefined
    ? dailyRecommendation.progressoParaMeta.diasRestantes
    : (targetDate ? Math.max(0, dayjs(targetDate).diff(dayjs(), 'days')) : 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-4 sm:p-6 mb-6 sm:mb-8"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 bg-gradient-to-br from-alego-600 to-alego-700 rounded-xl">
            <SparklesIcon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              Planejador de Estudos com IA
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Seu mentor personalizado na jornada do concurso
            </p>
          </div>
        </div>
        <div className="text-left sm:text-right flex flex-col sm:items-end gap-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Atualiza automaticamente às 06:00
          </p>
          {loading && (
            <p className="text-xs text-alego-600 dark:text-alego-400">
              Gerando novo plano...
            </p>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-alego-600 border-t-transparent"></div>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
            Gerando seu plano de estudos personalizado...
          </p>
        </div>
      ) : dailyRecommendation ? (
        <div className="space-y-4 sm:space-y-6">
          {/* Mensagem Motivacional */}
          <div className="bg-gradient-to-r from-alego-50 to-blue-50 dark:from-alego-900/20 dark:to-blue-900/20 rounded-xl p-3 sm:p-4 border border-alego-200 dark:border-alego-800">
            <div className="flex items-start gap-2 sm:gap-3">
              <FireIcon className="h-4 w-4 sm:h-5 sm:w-5 text-alego-600 dark:text-alego-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm sm:text-base text-alego-700 dark:text-alego-300 font-medium">
                {dailyRecommendation.mensagemMotivacional}
              </p>
            </div>
          </div>

          {/* Foco do Dia */}
          <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3 sm:p-4 border border-slate-200 dark:border-slate-600">
            <div className="flex items-center gap-2 sm:gap-3 mb-2">
              <CalendarIcon className="h-4 w-4 sm:h-5 sm:w-5 text-alego-600 dark:text-alego-400" />
              <h4 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">Foco de Hoje</h4>
            </div>
            <p className="text-base sm:text-lg font-bold text-alego-600 dark:text-alego-400 break-words">
              {dailyRecommendation.focoDoDia}
            </p>
          </div>

          {/* Atividades */}
          <div>
            <h4 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white mb-3 sm:mb-4 flex items-center gap-2">
              <AcademicCapIcon className="h-4 w-4 sm:h-5 sm:w-5 text-alego-600 dark:text-alego-400" />
              Atividades Recomendadas
            </h4>
            <div className="space-y-2 sm:space-y-3">
              {dailyRecommendation.atividades?.map((atividade, index) => {
                const Icon = getActivityIcon(atividade.tipo)
                const colorClass = getActivityColor(atividade.tipo)

                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                    className="border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden hover:shadow-md transition-shadow"
                  >
                    <div className="bg-gradient-to-r p-3 sm:p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
                          <div className={`p-1.5 sm:p-2 rounded-lg bg-gradient-to-br ${colorClass} flex-shrink-0`}>
                            <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                              <h5 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white break-words">
                                {atividade.materia}
                                {atividade.modulo && (
                                  <span className="text-slate-600 dark:text-slate-400 font-normal">
                                    {' - '}{atividade.modulo}
                                  </span>
                                )}
                              </h5>
                              <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getPriorityColor(atividade.prioridade)} self-start sm:self-auto`}>
                                {atividade.prioridade}
                              </span>
                            </div>
                            {atividade.topico && (
                              <p className="text-xs sm:text-sm font-medium text-alego-600 dark:text-alego-400 mb-1 break-words">
                                📌 {atividade.topico}
                              </p>
                            )}
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-2 break-words">
                              {atividade.descricao}
                            </p>
                            <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                              <div className="flex items-center gap-1">
                                <ClockIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                                {atividade.tempoEstimado}
                              </div>
                            </div>
                          </div>
                        </div>
                        <Link
                          to={getActivityLink(atividade.tipo, atividade.materia, atividade.modulo)}
                          className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-alego-600 text-white rounded-lg font-semibold hover:bg-alego-700 transition-colors text-sm text-center sm:text-left whitespace-nowrap flex items-center justify-center sm:justify-start gap-1"
                        >
                          Ir
                          <ArrowRightIcon className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>

          {/* Revisões */}
          {dailyRecommendation.revisoes && (
            <div className={`rounded-xl p-3 sm:p-4 border ${
              dailyRecommendation.revisoes.cardsUrgentes > 0
                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
            }`}>
              <div className="flex items-center gap-2 sm:gap-3 mb-2">
                <ArrowPathIcon className={`h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 ${
                  dailyRecommendation.revisoes.cardsUrgentes > 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`} />
                <h4 className={`text-sm sm:text-base font-semibold ${
                  dailyRecommendation.revisoes.cardsUrgentes > 0
                    ? 'text-red-900 dark:text-red-200'
                    : 'text-amber-900 dark:text-amber-200'
                }`}>
                  Revisões
                  {dailyRecommendation.revisoes.cardsUrgentes > 0 && (
                    <span className="ml-2 text-xs bg-red-200 dark:bg-red-800 px-2 py-0.5 rounded">
                      URGENTE
                    </span>
                  )}
                </h4>
              </div>
              <p className={`text-xs sm:text-sm break-words ${
                dailyRecommendation.revisoes.cardsUrgentes > 0
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-amber-700 dark:text-amber-300'
              }`}>
                {dailyRecommendation.revisoes.descricao}
                {dailyRecommendation.revisoes.cardsParaRevisar > 0 && (
                  <span className="font-semibold ml-1">
                    ({dailyRecommendation.revisoes.cardsParaRevisar} cards
                    {dailyRecommendation.revisoes.cardsUrgentes > 0 && 
                      `, ${dailyRecommendation.revisoes.cardsUrgentes} urgentes`
                    })
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Progresso para Meta */}
          {dailyRecommendation.progressoParaMeta && (
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-3 sm:p-4 border border-indigo-200 dark:border-indigo-800">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-3">
                <div className="flex items-center gap-2 sm:gap-3">
                  <ChartBarIcon className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                  <h4 className="text-sm sm:text-base font-semibold text-indigo-900 dark:text-indigo-200">
                    Progresso para Meta
                  </h4>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-xs text-indigo-600 dark:text-indigo-400">Meta: {metaDays} dias</p>
                  <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
                    {daysRemaining} dias restantes
                  </p>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-indigo-700 dark:text-indigo-300 mb-3 break-words">
                {dailyRecommendation.progressoParaMeta.mensagem}
              </p>
              {dailyRecommendation.progressoParaMeta.cardsPorDia > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center">
                  <div className="bg-white dark:bg-slate-700 rounded-lg p-2">
                    <p className="text-xs text-indigo-600 dark:text-indigo-400">Cards Restantes</p>
                    <p className="text-base sm:text-lg font-bold text-indigo-700 dark:text-indigo-300">
                      {dailyRecommendation.progressoParaMeta.cardsRestantes}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-slate-700 rounded-lg p-2">
                    <p className="text-xs text-indigo-600 dark:text-indigo-400">Por Dia</p>
                    <p className="text-base sm:text-lg font-bold text-indigo-700 dark:text-indigo-300">
                      {dailyRecommendation.progressoParaMeta.cardsPorDia}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-slate-700 rounded-lg p-2">
                    <p className="text-xs text-indigo-600 dark:text-indigo-400">Matérias Restantes</p>
                    <p className="text-base sm:text-lg font-bold text-indigo-700 dark:text-indigo-300">
                      {dailyRecommendation.progressoParaMeta.materiasRestantes}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dicas */}
          {dailyRecommendation.dicas && dailyRecommendation.dicas.length > 0 && (
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3 sm:p-4 border border-slate-200 dark:border-slate-600">
              <div className="flex items-center gap-2 sm:gap-3 mb-3">
                <LightBulbIcon className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500 flex-shrink-0" />
                <h4 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">Dicas do Mentor</h4>
              </div>
              <ul className="space-y-2">
                {dailyRecommendation.dicas.map((dica, index) => (
                  <li key={index} className="flex items-start gap-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                    <CheckCircleIcon className="h-3 w-3 sm:h-4 sm:w-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="break-words">{dica}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </motion.div>
  )
}

export default StudyPlanner

