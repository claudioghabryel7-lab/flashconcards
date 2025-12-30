import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  XMarkIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  BookOpenIcon,
  QuestionMarkCircleIcon,
  ClipboardDocumentCheckIcon,
  PencilSquareIcon,
  LightBulbIcon,
  ChartBarIcon,
  SparklesIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import { useDarkMode } from '../hooks/useDarkMode'
import { useAuth } from '../hooks/useAuth'

const DashboardTutorial = ({ onClose }) => {
  const { darkMode } = useDarkMode()
  const { user } = useAuth()
  const [currentStep, setCurrentStep] = useState(0)
  const [isVisible, setIsVisible] = useState(true)

  // Verificar se o usuário já viu o tutorial
  useEffect(() => {
    if (!user) return
    
    const tutorialKey = `dashboard_tutorial_completed_${user.uid}`
    const hasSeenTutorial = localStorage.getItem(tutorialKey) === 'true'
    
    if (hasSeenTutorial) {
      setIsVisible(false)
      onClose?.()
    }
  }, [user, onClose])

  // Marcar tutorial como completo
  const markAsCompleted = () => {
    if (user) {
      const tutorialKey = `dashboard_tutorial_completed_${user.uid}`
      localStorage.setItem(tutorialKey, 'true')
    }
    setIsVisible(false)
    onClose?.()
  }

  // Pular tutorial
  const skipTutorial = () => {
    markAsCompleted()
  }

  // Próximo passo
  const nextStep = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      markAsCompleted()
    }
  }

  // Passo anterior
  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const tutorialSteps = [
    {
      title: 'Bem-vindo ao FlashConCards! 🎓',
      description: 'Vamos te mostrar como usar todas as ferramentas da plataforma para maximizar seus estudos.',
      icon: SparklesIcon,
      content: (
        <div className="space-y-4">
          <p className="text-slate-600 dark:text-slate-400">
            Esta plataforma foi desenvolvida especialmente para ajudar você a passar no concurso. 
            Vamos conhecer as principais ferramentas e como usá-las de forma eficiente.
          </p>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              <strong>💡 Dica:</strong> Você pode pular este tutorial a qualquer momento e acessá-lo novamente nas configurações.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: '1. Planejador de Estudos com IA 🤖',
      description: 'Seu mentor personalizado que cria um plano de estudos diário baseado no seu progresso.',
      icon: SparklesIcon,
      content: (
        <div className="space-y-4">
          <p className="text-slate-600 dark:text-slate-400">
            O <strong>Planejador de Estudos</strong> aparece no topo do dashboard e é atualizado automaticamente todos os dias às 11:30.
          </p>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span><strong>Foco do Dia:</strong> Mostra o que você deve estudar hoje</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span><strong>Atividades Recomendadas:</strong> Sugestões específicas de módulos para estudar</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span><strong>Análise Inteligente:</strong> Considera sua dificuldade com cada card (again, hard, good, easy)</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span><strong>Progresso para Meta:</strong> Mostra quantos cards estudar por dia para atingir sua meta</span>
            </li>
          </ul>
          <div className="bg-gradient-to-r from-alego-50 to-blue-50 dark:from-alego-900/20 dark:to-blue-900/20 rounded-lg p-4 border border-alego-200 dark:border-alego-800">
            <p className="text-sm text-alego-700 dark:text-alego-300">
              <strong>🎯 Como usar:</strong> Siga as recomendações do planejador. Ele prioriza matérias problemáticas e sugere revisar cards difíceis antes de estudar conteúdo novo.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: '2. Flashcards com Repetição Espaçada 📚',
      description: 'Sistema inteligente que adapta o ritmo de estudos ao seu desempenho.',
      icon: BookOpenIcon,
      content: (
        <div className="space-y-4">
          <p className="text-slate-600 dark:text-slate-400">
            Os <strong>Flashcards</strong> são a base do seu estudo. Use o sistema de repetição espaçada para fixar o conteúdo.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-200 dark:border-red-800">
              <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1">❌ Again</p>
              <p className="text-xs text-red-600 dark:text-red-400">Errei - revisar em 10 min</p>
            </div>
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 border border-orange-200 dark:border-orange-800">
              <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">🟠 Hard</p>
              <p className="text-xs text-orange-600 dark:text-orange-400">Difícil - revisar em 1 dia</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">🔵 Good</p>
              <p className="text-xs text-blue-600 dark:text-blue-400">Lembrei bem - revisar em alguns dias</p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
              <p className="text-xs font-semibold text-green-700 dark:text-green-300 mb-1">🟢 Easy</p>
              <p className="text-xs text-green-600 dark:text-green-400">Muito fácil - revisar em muitos dias</p>
            </div>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              <strong>💡 Dica:</strong> Seja honesto ao avaliar! O sistema ajusta os intervalos de revisão baseado na sua dificuldade. Cards marcados como "again" ou "hard" aparecerão mais vezes.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: '3. FlashQuestões 💡',
      description: 'Questões geradas por IA para praticar e fixar o conteúdo estudado.',
      icon: QuestionMarkCircleIcon,
      content: (
        <div className="space-y-4">
          <p className="text-slate-600 dark:text-slate-400">
            Use <strong>FlashQuestões</strong> para praticar o que estudou nos flashcards. Questões são geradas por IA baseadas no conteúdo dos módulos.
          </p>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Selecione a matéria e módulo que você estudou</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Responda as questões e veja o feedback imediato</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Leia os BIZUs (explicações) para entender melhor</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Acompanhe sua taxa de acerto por matéria no dashboard</span>
            </li>
          </ul>
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
            <p className="text-sm text-purple-700 dark:text-purple-300">
              <strong>🎯 Objetivo:</strong> Atingir 90%+ de acerto em todas as matérias. Se estiver abaixo, foque em revisar os flashcards daquela matéria.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: '4. Simulados 📝',
      description: 'Avalie seu conhecimento completo com simulados completos.',
      icon: ClipboardDocumentCheckIcon,
      content: (
        <div className="space-y-4">
          <p className="text-slate-600 dark:text-slate-400">
            Os <strong>Simulados</strong> testam seu conhecimento completo em todas as matérias, simulando a prova real.
          </p>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Faça simulados regularmente para avaliar seu progresso</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Veja o diagnóstico final que mostra suas matérias mais fracas</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Use o diagnóstico para focar seus estudos nas áreas problemáticas</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Treine o tempo de prova para estar preparado no dia</span>
            </li>
          </ul>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
            <p className="text-sm text-green-700 dark:text-green-300">
              <strong>💡 Dica:</strong> Após cada simulado, foque nas matérias que tiveram menor desempenho. Revise flashcards e faça mais questões dessas áreas.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: '5. Treino de Redação ✍️',
      description: 'Pratique redações com feedback detalhado da IA.',
      icon: PencilSquareIcon,
      content: (
        <div className="space-y-4">
          <p className="text-slate-600 dark:text-slate-400">
            O <strong>Treino de Redação</strong> ajuda você a dominar a escrita dissertativa com feedback detalhado em cada critério.
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-50 dark:bg-slate-700 rounded p-2">
              <p className="font-semibold text-slate-700 dark:text-slate-300">Domínio</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700 rounded p-2">
              <p className="font-semibold text-slate-700 dark:text-slate-300">Compreensão</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700 rounded p-2">
              <p className="font-semibold text-slate-700 dark:text-slate-300">Argumentação</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700 rounded p-2">
              <p className="font-semibold text-slate-700 dark:text-slate-300">Estrutura</p>
            </div>
          </div>
          <div className="bg-pink-50 dark:bg-pink-900/20 rounded-lg p-4 border border-pink-200 dark:border-pink-800">
            <p className="text-sm text-pink-700 dark:text-pink-300">
              <strong>🎯 Objetivo:</strong> Atingir 9+ em todos os critérios. A IA analisa sua redação e dá feedback específico em cada critério para você melhorar.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: '6. Mapas Mentais 🧠',
      description: 'Revise o conteúdo de forma visual e organizada.',
      icon: LightBulbIcon,
      content: (
        <div className="space-y-4">
          <p className="text-slate-600 dark:text-slate-400">
            Os <strong>Mapas Mentais</strong> ajudam você a visualizar e revisar o conteúdo de forma rápida antes das provas.
          </p>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Use para revisão rápida antes das provas</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Crie conexões visuais entre os temas</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Ideal para memorização e fixação</span>
            </li>
          </ul>
        </div>
      ),
    },
    {
      title: '7. Dashboard e Métricas 📊',
      description: 'Acompanhe seu progresso e mantenha a motivação.',
      icon: ChartBarIcon,
      content: (
        <div className="space-y-4">
          <p className="text-slate-600 dark:text-slate-400">
            O <strong>Dashboard</strong> mostra todas as suas métricas de progresso em tempo real.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">🔥 Sequência</p>
              <p className="text-xs text-blue-600 dark:text-blue-400">Dias consecutivos estudando</p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
              <p className="text-xs font-semibold text-green-700 dark:text-green-300 mb-1">⏰ Horas</p>
              <p className="text-xs text-green-600 dark:text-green-400">Total de horas estudadas</p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
              <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">📚 Cards</p>
              <p className="text-xs text-purple-600 dark:text-purple-400">Cards estudados</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">📈 Taxa</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">Taxa de acerto</p>
            </div>
          </div>
          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800">
            <p className="text-sm text-indigo-700 dark:text-indigo-300">
              <strong>💡 Dica:</strong> Mantenha sua sequência de estudos! O calendário mostra todos os dias que você estudou. Quanto mais consistente, melhor seu desempenho.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: 'Ciclo de Estudos Recomendado 🔄',
      description: 'A ordem ideal para maximizar seu aprendizado.',
      icon: ChartBarIcon,
      content: (
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold">1</div>
              <div>
                <p className="font-semibold text-blue-700 dark:text-blue-300">Estude Flashcards</p>
                <p className="text-xs text-blue-600 dark:text-blue-400">Base teórica</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <div className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center font-bold">2</div>
              <div>
                <p className="font-semibold text-purple-700 dark:text-purple-300">Pratique Questões</p>
                <p className="text-xs text-purple-600 dark:text-purple-400">Aplicação do conhecimento</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center font-bold">3</div>
              <div>
                <p className="font-semibold text-green-700 dark:text-green-300">Faça Simulados</p>
                <p className="text-xs text-green-600 dark:text-green-400">Avaliação completa</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
              <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold">4</div>
              <div>
                <p className="font-semibold text-orange-700 dark:text-orange-300">Calibre Estudos</p>
                <p className="text-xs text-orange-600 dark:text-orange-400">Foque nos pontos fracos</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
              <div className="w-8 h-8 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold">5</div>
              <div>
                <p className="font-semibold text-indigo-700 dark:text-indigo-300">Repita</p>
                <p className="text-xs text-indigo-600 dark:text-indigo-400">Até dominar tudo</p>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-r from-alego-50 to-blue-50 dark:from-alego-900/20 dark:to-blue-900/20 rounded-lg p-4 border border-alego-200 dark:border-alego-800">
            <p className="text-sm text-alego-700 dark:text-alego-300">
              <strong>🎯 Lembre-se:</strong> Use o diagnóstico de calibração após simulados para saber exatamente o que estudar. O planejador de estudos também te guia nesse ciclo automaticamente!
            </p>
          </div>
        </div>
      ),
    },
    {
      title: 'Pronto para começar! 🚀',
      description: 'Agora você conhece todas as ferramentas. Vamos estudar!',
      icon: CheckCircleIcon,
      content: (
        <div className="space-y-4">
          <p className="text-slate-600 dark:text-slate-400">
            Você está pronto para começar sua jornada de estudos! Lembre-se:
          </p>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Siga as recomendações do <strong>Planejador de Estudos</strong> diariamente</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Seja honesto ao avaliar a dificuldade dos flashcards</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Mantenha a consistência - estude todos os dias</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Use o diagnóstico de calibração para focar nos pontos fracos</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span>Acompanhe seu progresso no dashboard</span>
            </li>
          </ul>
          <div className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
            <p className="text-sm text-green-700 dark:text-green-300 font-semibold">
              🎓 Boa sorte nos estudos! Você consegue!
            </p>
          </div>
        </div>
      ),
    },
  ]

  if (!isVisible) return null

  const currentStepData = tutorialSteps[currentStep]
  const Icon = currentStepData.icon

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={skipTutorial}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative w-full max-w-2xl bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              {/* Header */}
              <div className="relative bg-gradient-to-r from-alego-600 to-blue-600 p-6">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                      <Icon className="h-8 w-8 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black text-white mb-1">
                        {currentStepData.title}
                      </h2>
                      <p className="text-white/90 text-sm">
                        {currentStepData.description}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={skipTutorial}
                    className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                  >
                    <XMarkIcon className="h-6 w-6 text-white" />
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="h-1 bg-slate-200 dark:bg-slate-700">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${((currentStep + 1) / tutorialSteps.length) * 100}%` }}
                  className="h-full bg-gradient-to-r from-alego-600 to-blue-600"
                />
              </div>

              {/* Content */}
              <div className="p-6 max-h-[60vh] overflow-y-auto">
                {currentStepData.content}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-700/50 border-t border-slate-200 dark:border-slate-600 flex items-center justify-between">
                <button
                  onClick={skipTutorial}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-semibold transition-colors"
                >
                  Pular Tutorial
                </button>

                <div className="flex items-center gap-3">
                  <button
                    onClick={prevStep}
                    disabled={currentStep === 0}
                    className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <ChevronLeftIcon className="h-5 w-5" />
                    Anterior
                  </button>

                  <button
                    onClick={nextStep}
                    className="px-6 py-2 rounded-lg bg-gradient-to-r from-alego-600 to-blue-600 text-white font-semibold hover:from-alego-700 hover:to-blue-700 transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
                  >
                    {currentStep === tutorialSteps.length - 1 ? (
                      <>
                        Finalizar
                        <CheckCircleIcon className="h-5 w-5" />
                      </>
                    ) : (
                      <>
                        Próximo
                        <ChevronRightIcon className="h-5 w-5" />
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Step Indicator */}
              <div className="px-6 py-3 bg-slate-50 dark:bg-slate-700/50 border-t border-slate-200 dark:border-slate-600">
                <div className="flex items-center justify-center gap-2">
                  {tutorialSteps.map((_, index) => (
                    <div
                      key={index}
                      className={`h-2 rounded-full transition-all ${
                        index === currentStep
                          ? 'w-8 bg-alego-600'
                          : index < currentStep
                          ? 'w-2 bg-green-500'
                          : 'w-2 bg-slate-300 dark:bg-slate-600'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-2">
                  Passo {currentStep + 1} de {tutorialSteps.length}
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default DashboardTutorial

