import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpenIcon,
  QuestionMarkCircleIcon,
  ClipboardDocumentCheckIcon,
  PencilSquareIcon,
  ChartBarIcon,
  LightBulbIcon,
  TrophyIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  FireIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline'
import { useDarkMode } from '../hooks/useDarkMode'
import { useAuth } from '../hooks/useAuth'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import dayjs from 'dayjs'

const GuiaEstudos = () => {
  const { darkMode } = useDarkMode()
  const { user, profile } = useAuth()
  const [expandedStep, setExpandedStep] = useState(null)
  const [progressData, setProgressData] = useState([])
  const [stats, setStats] = useState(null)
  const [visibleSteps, setVisibleSteps] = useState(new Set())

  // Forçar atualização diária das estatísticas
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

  // Carregar progresso do usuário
  useEffect(() => {
    if (!user) return () => {}

    const progressRef = collection(db, 'progress')
    const q = query(progressRef, where('uid', '==', user.uid))

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => doc.data())
        setProgressData(data)

        // Calcular estatísticas
        const totalDays = new Set(data.map((item) => item.date)).size
        const totalHours = data.reduce((sum, item) => sum + parseFloat(item.hours || 0), 0)
        const studiedCards = profile?.studiedCards?.length || 0

        setStats({
          totalDays,
          totalHours: totalHours.toFixed(1),
          studiedCards,
        })
      },
      (error) => {
        console.error('Erro ao carregar progresso:', error)
        setProgressData([])
      }
    )

    return () => unsub()
  }, [user, profile, currentDate]) // Adicionar currentDate como dependência

  // Animações de entrada ao scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisibleSteps((prev) => new Set([...prev, entry.target.id]))
          }
        })
      },
      { threshold: 0.1 }
    )

    const elements = document.querySelectorAll('[data-animate]')
    elements.forEach((el) => observer.observe(el))

    return () => {
      elements.forEach((el) => observer.unobserve(el))
    }
  }, [])

  const steps = [
    {
      id: 'flashcards',
      icon: BookOpenIcon,
      title: '1. Estude os Flashcards',
      description: 'Base teórica de todo o conteúdo',
      details: [
        'Complete todos os módulos na ordem sugerida',
        'Revise os cards até dominar completamente',
        'O sistema usa repetição espaçada para fixar o conteúdo',
        'Marque os módulos como estudados quando terminar',
      ],
      link: '/flashcards',
      linkText: 'Ir para Flashcards',
      color: 'blue',
      tip: 'Use o sistema de repetição espaçada - ele mostra os cards no momento ideal para revisão!',
    },
    {
      id: 'questoes',
      icon: QuestionMarkCircleIcon,
      title: '2. Pratique com FlashQuestões',
      description: 'Aplique o conhecimento em questões',
      details: [
        'Resolva questões de todas as matérias',
        'Use o diagnóstico de calibração para focar nos pontos fracos',
        'Revise os erros e entenda o motivo',
        'Objetivo: 90%+ de acerto em todas as matérias',
      ],
      link: '/flashquestoes',
      linkText: 'Ir para FlashQuestões',
      color: 'green',
      tip: 'Após responder questões, veja o diagnóstico de calibração para saber exatamente o que estudar!',
    },
    {
      id: 'simulado',
      icon: ClipboardDocumentCheckIcon,
      title: '3. Faça Simulados',
      description: 'Avalie seu desempenho completo',
      details: [
        'Faça simulados completos regularmente',
        'Use o diagnóstico final para identificar pontos fracos',
        'Estude as matérias que precisam de calibração',
        'Treine o tempo de prova',
      ],
      link: '/simulado',
      linkText: 'Ir para Simulados',
      color: 'purple',
      tip: 'O diagnóstico após o simulado mostra suas matérias mais fracas - foque nelas!',
    },
    {
      id: 'redacao',
      icon: PencilSquareIcon,
      title: '4. Treine Redação',
      description: 'Domine a escrita dissertativa',
      details: [
        'Pratique redações com temas do edital',
        'Use o feedback da IA para melhorar',
        'Foque nos critérios: domínio, compreensão, argumentação, estrutura, conhecimento',
        'Objetivo: 9+ em todos os critérios',
      ],
      link: '/treino-redacao',
      linkText: 'Ir para Treino Redação',
      color: 'pink',
      tip: 'A IA analisa sua redação e dá feedback detalhado em cada critério - use isso para melhorar!',
    },
    {
      id: 'mapas',
      icon: LightBulbIcon,
      title: '5. Use Mapas Mentais',
      description: 'Revise e fixe o conteúdo',
      details: [
        'Use para revisão rápida antes das provas',
        'Crie conexões entre os temas',
        'Visualize a estrutura do conteúdo',
        'Ideal para memorização',
      ],
      link: '/mapas-mentais',
      linkText: 'Ir para Mapas Mentais',
      color: 'yellow',
      tip: 'Mapas mentais ajudam a visualizar conexões entre conceitos - perfeito para revisão!',
    },
  ]

  const metrics = [
    {
      icon: ChartBarIcon,
      title: 'Taxa de Acerto por Matéria',
      target: '90%+',
      description: 'Acompanhe no FlashQuestões. Foque nas matérias abaixo de 90%.',
      userValue: stats ? 'Acompanhe no FlashQuestões' : null,
    },
    {
      icon: BookOpenIcon,
      title: 'Módulos Estudados',
      target: '100%',
      description: 'Complete todos os módulos de todas as matérias antes da prova.',
      userValue: stats ? `${stats.studiedCards} cards estudados` : null,
    },
    {
      icon: FireIcon,
      title: 'Dias de Estudo',
      target: 'Máximo possível',
      description: 'Mantenha a sequência de estudos. Consistência é fundamental.',
      userValue: stats ? `${stats.totalDays} dias` : null,
    },
    {
      icon: TrophyIcon,
      title: 'Horas de Estudo',
      target: 'Quanto mais, melhor',
      description: 'Acompanhe suas horas de estudo e mantenha a consistência.',
      userValue: stats ? `${stats.totalHours}h` : null,
    },
  ]

  const cycle = [
    {
      step: 1,
      title: 'Estude Flashcards',
      description: 'Base teórica',
      icon: BookOpenIcon,
    },
    {
      step: 2,
      title: 'Pratique Questões',
      description: 'Aplicação',
      icon: QuestionMarkCircleIcon,
    },
    {
      step: 3,
      title: 'Faça Simulados',
      description: 'Avaliação',
      icon: ClipboardDocumentCheckIcon,
    },
    {
      step: 4,
      title: 'Calibre Estudos',
      description: 'Foco nos pontos fracos',
      icon: ChartBarIcon,
    },
    {
      step: 5,
      title: 'Repita',
      description: 'Até dominar tudo',
      icon: TrophyIcon,
    },
  ]

  const toggleStep = (stepId) => {
    setExpandedStep(expandedStep === stepId ? null : stepId)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header com animação */}
        <div
          data-animate
          id="header"
          className={`text-center space-y-4 transition-all duration-1000 ${
            visibleSteps.has('header') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
          }`}
        >
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-alego-600/30 to-alego-700/30 rounded-xl blur-lg animate-pulse"></div>
              <div className="relative bg-gradient-to-br from-alego-600 to-alego-700 dark:from-alego-500 dark:to-alego-600 rounded-xl p-3 shadow-lg">
                <AcademicCapIcon className="h-8 w-8 text-white" />
              </div>
            </div>
            <h1 className="text-4xl sm:text-5xl font-black text-slate-900 dark:text-white">
              Guia de Estudos
            </h1>
          </div>
          <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Aprenda como usar a plataforma para alcançar 100% de acerto na prova e redação perfeita
          </p>
          {stats && (
            <div className="flex flex-wrap items-center justify-center gap-4 mt-6">
              <div className="px-4 py-2 rounded-lg bg-alego-100 dark:bg-alego-900/30 border border-alego-300 dark:border-alego-700">
                <p className="text-xs text-alego-600 dark:text-alego-400 font-semibold">Seu Progresso</p>
                <p className="text-lg font-black text-alego-700 dark:text-alego-300">
                  {stats.totalDays} dias • {stats.totalHours}h
                </p>
              </div>
              <div className="px-4 py-2 rounded-lg bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700">
                <p className="text-xs text-green-600 dark:text-green-400 font-semibold">Cards Estudados</p>
                <p className="text-lg font-black text-green-700 dark:text-green-300">{stats.studiedCards}</p>
              </div>
            </div>
          )}
        </div>

        {/* Ciclo de Estudos com animação */}
        <div
          data-animate
          id="cycle"
          className={`rounded-2xl p-6 sm:p-8 transition-all duration-1000 delay-200 ${
            visibleSteps.has('cycle') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
          } ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-xl`}
        >
          <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-slate-900 dark:text-white flex items-center gap-3">
            <ChartBarIcon className="h-8 w-8 text-alego-600 animate-pulse" />
            Ciclo de Estudos Recomendado
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
            {cycle.map((item, index) => {
              const Icon = item.icon
              return (
                <div
                  key={item.step}
                  className="relative group cursor-pointer transform transition-all duration-300 hover:scale-105"
                  style={{
                    animationDelay: `${index * 100}ms`,
                  }}
                >
                  <div
                    className={`rounded-xl p-4 text-center transition-all duration-300 ${
                      darkMode ? 'bg-slate-700 group-hover:bg-slate-600' : 'bg-gradient-to-br from-alego-50 to-alego-100 group-hover:from-alego-100 group-hover:to-alego-200'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-alego-600 to-alego-700 text-white flex items-center justify-center font-bold text-xl mx-auto mb-3 shadow-lg group-hover:shadow-xl transition-all">
                      {item.step}
                    </div>
                    <div className="mb-2">
                      <Icon className="h-6 w-6 text-alego-600 mx-auto" />
                    </div>
                    <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white mb-1">
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">{item.description}</p>
                  </div>
                  {index < cycle.length - 1 && (
                    <div className="hidden sm:block absolute top-1/2 -right-2 transform -translate-y-1/2 z-10 animate-pulse">
                      <ArrowRightIcon className="h-6 w-6 text-alego-600" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Passos Detalhados com acordeão */}
        <div className="space-y-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white text-center">
            Como Usar Cada Ferramenta
          </h2>
          {steps.map((step, index) => {
            const Icon = step.icon
            const isExpanded = expandedStep === step.id
            const colorClasses = {
              blue: 'from-blue-500 to-blue-600',
              green: 'from-green-500 to-green-600',
              purple: 'from-purple-500 to-purple-600',
              pink: 'from-pink-500 to-pink-600',
              yellow: 'from-yellow-500 to-yellow-600',
            }
            return (
              <div
                key={index}
                data-animate
                id={`step-${index}`}
                className={`rounded-2xl p-6 sm:p-8 transition-all duration-500 ${
                  visibleSteps.has(`step-${index}`) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
                } ${
                  darkMode ? 'bg-slate-800' : 'bg-white'
                } shadow-xl border-2 border-slate-200 dark:border-slate-700 hover:shadow-2xl transform hover:scale-[1.01]`}
                style={{
                  animationDelay: `${index * 100}ms`,
                }}
              >
                <div className="flex flex-col sm:flex-row gap-6">
                  <div className="flex-shrink-0">
                    <div
                      className={`w-16 h-16 rounded-xl bg-gradient-to-br ${colorClasses[step.color]} flex items-center justify-center shadow-lg transform transition-all duration-300 hover:scale-110 hover:rotate-3`}
                    >
                      <Icon className="h-8 w-8 text-white" />
                    </div>
                  </div>
                  <div className="flex-1 space-y-4">
                    <div>
                      <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-2">
                        {step.title}
                      </h3>
                      <p className="text-slate-600 dark:text-slate-400 text-lg">{step.description}</p>
                    </div>

                    {/* Botão para expandir/recolher */}
                    <button
                      onClick={() => toggleStep(step.id)}
                      className="flex items-center gap-2 text-alego-600 dark:text-alego-400 font-semibold hover:text-alego-700 dark:hover:text-alego-300 transition-colors"
                    >
                      <span>{isExpanded ? 'Ocultar detalhes' : 'Ver detalhes'}</span>
                      <ChevronDownIcon
                        className={`h-5 w-5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {/* Detalhes expansíveis */}
                    <div
                      className={`overflow-hidden transition-all duration-500 ${
                        isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                      }`}
                    >
                      <ul className="space-y-2">
                        {step.details.map((detail, idx) => (
                          <li
                            key={idx}
                            className="flex items-start gap-3 animate-fade-in"
                            style={{ animationDelay: `${idx * 50}ms` }}
                          >
                            <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                            <span className="text-slate-700 dark:text-slate-300">{detail}</span>
                          </li>
                        ))}
                      </ul>
                      {step.tip && (
                        <div className="mt-4 p-4 rounded-lg bg-alego-50 dark:bg-alego-900/20 border border-alego-200 dark:border-alego-800">
                          <div className="flex items-start gap-2">
                            <LightBulbIcon className="h-5 w-5 text-alego-600 dark:text-alego-400 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-alego-700 dark:text-alego-300">
                              <strong>💡 Dica:</strong> {step.tip}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <Link
                      to={step.link}
                      className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-br ${colorClasses[step.color]} text-white font-semibold hover:shadow-lg transition-all hover:scale-105 transform`}
                    >
                      {step.linkText}
                      <ArrowRightIcon className="h-5 w-5" />
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Métricas e Resultados com dados reais */}
        <div
          data-animate
          id="metrics"
          className={`rounded-2xl p-6 sm:p-8 transition-all duration-1000 delay-300 ${
            visibleSteps.has('metrics') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
          } ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-xl`}
        >
          <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-slate-900 dark:text-white flex items-center gap-3">
            <TrophyIcon className="h-8 w-8 text-alego-600" />
            Como Saber se Está Tendo Resultados
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6 text-lg">
            Acompanhe essas métricas e use o diagnóstico de calibração para focar nos pontos fracos:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {metrics.map((metric, index) => {
              const Icon = metric.icon
              return (
                <div
                  key={index}
                  className={`rounded-xl p-6 transition-all duration-300 hover:scale-105 ${
                    darkMode ? 'bg-slate-700' : 'bg-gradient-to-br from-slate-50 to-slate-100'
                  } border-2 border-slate-200 dark:border-slate-600`}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-alego-600 to-alego-700 flex items-center justify-center shadow-lg">
                        <Icon className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-1">
                        {metric.title}
                      </h3>
                      <div className="flex items-baseline gap-2 mb-2">
                        <p className="text-2xl font-black text-alego-600">{metric.target}</p>
                        {metric.userValue && (
                          <p className="text-sm text-slate-500 dark:text-slate-400">• {metric.userValue}</p>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">{metric.description}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Dica Final */}
        <div
          data-animate
          id="tip"
          className={`rounded-2xl p-6 sm:p-8 transition-all duration-1000 delay-500 ${
            visibleSteps.has('tip') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
          } ${
            darkMode ? 'bg-gradient-to-br from-alego-900/30 to-alego-800/30' : 'bg-gradient-to-br from-alego-50 to-alego-100'
          } border-2 border-alego-300 dark:border-alego-700 shadow-xl`}
        >
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-alego-600 to-alego-700 flex items-center justify-center shadow-lg">
                <LightBulbIcon className="h-6 w-6 text-white" />
              </div>
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-3">
                💡 Dica Final
              </h3>
              <p className="text-lg text-slate-700 dark:text-slate-300 leading-relaxed">
                Use o <strong>diagnóstico de calibração</strong> que aparece após cada simulado e nas FlashQuestões.
                Ele mostra exatamente quais matérias precisam de mais estudo. Foque nessas matérias até atingir
                90%+ de acerto em todas. A plataforma te guia — siga as recomendações!
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div
          data-animate
          id="cta"
          className={`text-center space-y-4 transition-all duration-1000 delay-700 ${
            visibleSteps.has('cta') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
          }`}
        >
          <Link
            to="/flashcards"
            className="inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-gradient-to-br from-alego-600 to-alego-700 text-white font-bold text-lg hover:shadow-xl transition-all hover:scale-105 transform"
          >
            <TrophyIcon className="h-6 w-6" />
            Começar a Estudar Agora
            <ArrowRightIcon className="h-6 w-6" />
          </Link>
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  )
}

export default GuiaEstudos
