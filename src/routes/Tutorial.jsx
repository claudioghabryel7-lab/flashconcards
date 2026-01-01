import { motion } from 'framer-motion'
import { useDarkMode } from '../hooks/useDarkMode'
import {
  BookOpenIcon,
  QuestionMarkCircleIcon,
  ClipboardDocumentCheckIcon,
  AcademicCapIcon,
  LightBulbIcon,
  ChartBarIcon,
  ClockIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  SparklesIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'

const Tutorial = () => {
  const { darkMode } = useDarkMode()

  const sections = [
    {
      id: 'introducao',
      title: 'Bem-vindo ao FlashConCards!',
      icon: SparklesIcon,
      content: (
        <div className="space-y-4">
          <p className="text-slate-700 dark:text-slate-300">
            O FlashConCards é uma plataforma completa de estudos para concursos públicos, 
            desenvolvida com inteligência artificial para otimizar seu aprendizado e 
            maximizar seus resultados.
          </p>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>🎯 Objetivo:</strong> Ajudar você a dominar todo o conteúdo do edital 
              em 30 dias através de ciclos de estudo eficientes e repetição espaçada.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'planejador-ia',
      title: 'Planejador de Estudos com IA',
      icon: SparklesIcon,
      content: (
        <div className="space-y-4">
          <p className="text-slate-700 dark:text-slate-300">
            O planejador utiliza inteligência artificial para criar recomendações 
            personalizadas de estudo baseadas no seu progresso e no edital verticalizado.
          </p>
          <div className="space-y-3">
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800">
              <h4 className="font-semibold text-indigo-900 dark:text-indigo-200 mb-2">
                Como funciona:
              </h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-indigo-800 dark:text-indigo-300">
                <li>Analisa seu progresso no edital</li>
                <li>Identifica tópicos prioritários para estudar hoje</li>
                <li>Recomenda entre 3 a 5 atividades específicas</li>
                <li>Organiza tudo para completar o edital em 30 dias</li>
              </ul>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
              <h4 className="font-semibold text-green-900 dark:text-green-200 mb-2">
                Como usar:
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-green-800 dark:text-green-300">
                <li>Veja as atividades recomendadas no planejador</li>
                <li>Clique em "Ver Tópico" para acessar o conteúdo</li>
                <li>Estude o tópico completo</li>
                <li>Clique em "OK" quando concluir cada atividade</li>
                <li>Quando todas as atividades estiverem concluídas, novas recomendações serão geradas automaticamente</li>
              </ol>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'ciclos-estudo',
      title: 'Ciclos de Estudo e Repetição Espaçada',
      icon: ArrowPathIcon,
      content: (
        <div className="space-y-4">
          <p className="text-slate-700 dark:text-slate-300">
            O sistema utiliza o algoritmo de repetição espaçada (Spaced Repetition) 
            para otimizar sua memória de longo prazo. Quanto mais você revisa, 
            mais tempo passa até a próxima revisão.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
              <h4 className="font-semibold text-purple-900 dark:text-purple-200 mb-2">
                📚 Ciclo de Aprendizado
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-purple-800 dark:text-purple-300">
                <li><strong>Novo:</strong> Primeira vez que você vê o card</li>
                <li><strong>Revisão:</strong> Revisões programadas pelo algoritmo</li>
                <li><strong>Dominado:</strong> Card que você já domina bem</li>
              </ol>
            </div>
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
              <h4 className="font-semibold text-orange-900 dark:text-orange-200 mb-2">
                ⏰ Intervalos de Revisão
              </h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-orange-800 dark:text-orange-300">
                <li>1ª revisão: 1 dia depois</li>
                <li>2ª revisão: 3 dias depois</li>
                <li>3ª revisão: 7 dias depois</li>
                <li>4ª revisão: 15 dias depois</li>
                <li>E assim por diante...</li>
              </ul>
            </div>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>💡 Dica:</strong> Quanto mais você acerta, maior o intervalo até a próxima revisão. 
              Se errar, o intervalo diminui para reforçar o aprendizado.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'flashcards',
      title: 'Flashcards',
      icon: BookOpenIcon,
      content: (
        <div className="space-y-4">
          <p className="text-slate-700 dark:text-slate-300">
            Os flashcards são cartões de estudo que apresentam uma pergunta ou conceito 
            na frente e a resposta no verso. Eles são fundamentais para memorização.
          </p>
          <div className="space-y-3">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <h4 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">
                Como estudar com flashcards:
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800 dark:text-blue-300">
                <li>Leia a pergunta/conceito na frente do card</li>
                <li>Tente responder mentalmente</li>
                <li>Vire o card para ver a resposta</li>
                <li>Marque como "Lembrei" ou "Esqueci"</li>
                <li>O sistema agendará a próxima revisão automaticamente</li>
              </ol>
            </div>
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800">
              <h4 className="font-semibold text-indigo-900 dark:text-indigo-200 mb-2">
                Estratégias eficazes:
              </h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-indigo-800 dark:text-indigo-300">
                <li>Estude em sessões curtas (20-30 minutos)</li>
                <li>Revise os cards diariamente</li>
                <li>Foque nos cards que você errou</li>
                <li>Use os filtros para estudar por matéria</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'flashquestoes',
      title: 'FlashQuestões',
      icon: QuestionMarkCircleIcon,
      content: (
        <div className="space-y-4">
          <p className="text-slate-700 dark:text-slate-300">
            As FlashQuestões são questões geradas por inteligência artificial baseadas 
            no conteúdo do edital. Elas ajudam você a testar seu conhecimento e identificar 
            pontos fracos.
          </p>
          <div className="space-y-3">
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
              <h4 className="font-semibold text-purple-900 dark:text-purple-200 mb-2">
                Como usar:
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-purple-800 dark:text-purple-300">
                <li>Selecione uma matéria ou tópico</li>
                <li>Configure a dificuldade e quantidade de questões</li>
                <li>Responda as questões</li>
                <li>Veja o feedback imediato com explicações</li>
                <li>Revise as questões que você errou</li>
              </ol>
            </div>
            <div className="bg-pink-50 dark:bg-pink-900/20 rounded-lg p-4 border border-pink-200 dark:border-pink-800">
              <h4 className="font-semibold text-pink-900 dark:text-pink-200 mb-2">
                Benefícios:
              </h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-pink-800 dark:text-pink-300">
                <li>Questões personalizadas para seu edital</li>
                <li>Feedback imediato e explicações detalhadas</li>
                <li>Identificação de pontos fracos</li>
                <li>Preparação para o formato de prova</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'simulado',
      title: 'Simulados',
      icon: ClipboardDocumentCheckIcon,
      content: (
        <div className="space-y-4">
          <p className="text-slate-700 dark:text-slate-300">
            Os simulados são provas completas que simulam o formato real do concurso. 
            Eles são essenciais para testar seu conhecimento e se preparar para o dia da prova.
          </p>
          <div className="space-y-3">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
              <h4 className="font-semibold text-green-900 dark:text-green-200 mb-2">
                Como fazer um simulado:
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-green-800 dark:text-green-300">
                <li>Configure o tempo e quantidade de questões</li>
                <li>Responda todas as questões no tempo estipulado</li>
                <li>Revise suas respostas antes de finalizar</li>
                <li>Veja seu resultado e estatísticas detalhadas</li>
                <li>Analise as questões que você errou</li>
              </ol>
            </div>
            <div className="bg-teal-50 dark:bg-teal-900/20 rounded-lg p-4 border border-teal-200 dark:border-teal-800">
              <h4 className="font-semibold text-teal-900 dark:text-teal-200 mb-2">
                Dicas para simulados:
              </h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-teal-800 dark:text-teal-300">
                <li>Faça simulados regularmente (1-2 por semana)</li>
                <li>Respeite o tempo limite</li>
                <li>Analise seus erros e revise os tópicos relacionados</li>
                <li>Use os simulados para identificar padrões de erro</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'edital-verticalizado',
      title: 'Edital Verticalizado',
      icon: DocumentTextIcon,
      content: (
        <div className="space-y-4">
          <p className="text-slate-700 dark:text-slate-300">
            O edital verticalizado é o edital do concurso organizado de forma estruturada, 
            dividido por disciplinas e tópicos. É sua bússola de estudos.
          </p>
          <div className="space-y-3">
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800">
              <h4 className="font-semibold text-indigo-900 dark:text-indigo-200 mb-2">
                Como usar:
              </h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-indigo-800 dark:text-indigo-300">
                <li>Navegue pelas disciplinas e tópicos</li>
                <li>Marque os tópicos que você já estudou</li>
                <li>Use como checklist para acompanhar seu progresso</li>
                <li>O planejador de IA usa o edital para fazer recomendações</li>
              </ul>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <h4 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">
                Marcações disponíveis:
              </h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-blue-800 dark:text-blue-300">
                <li><strong>Flashcards:</strong> Marque quando estudou com flashcards</li>
                <li><strong>Questões:</strong> Marque quando fez questões sobre o tópico</li>
                <li><strong>Estudado:</strong> Marque quando completou o estudo do tópico</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'dashboard',
      title: 'Dashboard e Progresso',
      icon: ChartBarIcon,
      content: (
        <div className="space-y-4">
          <p className="text-slate-700 dark:text-slate-300">
            O dashboard é seu centro de controle. Aqui você acompanha todo seu progresso, 
            estatísticas e desempenho.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-4 border border-cyan-200 dark:border-cyan-800">
              <h4 className="font-semibold text-cyan-900 dark:text-cyan-200 mb-2">
                📊 Estatísticas
              </h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-cyan-800 dark:text-cyan-300">
                <li>Dias estudados</li>
                <li>Horas de estudo</li>
                <li>Cards estudados</li>
                <li>Taxa de acerto</li>
                <li>Sequência (streak)</li>
              </ul>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
              <h4 className="font-semibold text-amber-900 dark:text-amber-200 mb-2">
                📅 Calendário
              </h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-amber-800 dark:text-amber-300">
                <li>Visualize seus dias de estudo</li>
                <li>Acompanhe sua sequência</li>
                <li>Veja progresso por matéria</li>
                <li>Marque dias manualmente</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'dicas',
      title: 'Dicas para Sucesso',
      icon: LightBulbIcon,
      content: (
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
              <h4 className="font-semibold text-green-900 dark:text-green-200 mb-2">
                ✅ Boas Práticas
              </h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-green-800 dark:text-green-300">
                <li>Estude todos os dias, mesmo que pouco</li>
                <li>Siga as recomendações do planejador de IA</li>
                <li>Revise os flashcards diariamente</li>
                <li>Faça simulados regularmente</li>
                <li>Analise seus erros e aprenda com eles</li>
                <li>Mantenha uma rotina consistente</li>
              </ul>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
              <h4 className="font-semibold text-red-900 dark:text-red-200 mb-2">
                ❌ Evite
              </h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-red-800 dark:text-red-300">
                <li>Estudar apenas quando "tem vontade"</li>
                <li>Pular revisões programadas</li>
                <li>Focar apenas em uma matéria</li>
                <li>Ignorar os tópicos difíceis</li>
                <li>Estudar por muitas horas seguidas</li>
                <li>Comparar seu progresso com outros</li>
              </ul>
            </div>
          </div>
          <div className="bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg p-6 text-white">
            <h4 className="font-bold text-lg mb-2">🎯 Meta de 30 Dias</h4>
            <p className="text-sm text-white/90">
              O sistema está configurado para ajudá-lo a completar todo o edital em 30 dias. 
              Siga as recomendações do planejador de IA, mantenha a consistência e você 
              alcançará seu objetivo!
            </p>
          </div>
        </div>
      )
    }
  ]

  return (
    <div className={`min-h-screen ${darkMode ? 'dark' : ''} bg-slate-50 dark:bg-slate-900`}>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-8 text-white shadow-xl">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                <AcademicCapIcon className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-3xl font-black mb-2">Tutorial Completo</h1>
                <p className="text-indigo-100">
                  Aprenda a usar todas as funcionalidades do FlashConCards
                </p>
              </div>
            </div>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg font-semibold transition-colors text-sm backdrop-blur-sm"
            >
              ← Voltar ao Dashboard
            </Link>
          </div>
        </motion.div>

        {/* Conteúdo */}
        <div className="space-y-6">
          {sections.map((section, index) => {
            const Icon = section.icon
            return (
              <motion.div
                key={section.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
                    <Icon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex-1">
                    {section.title}
                  </h2>
                </div>
                <div className="ml-16">
                  {section.content}
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-12 text-center"
        >
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              Precisa de mais ajuda? Entre em contato com o suporte.
            </p>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
            >
              Começar a Estudar
              <CheckCircleIcon className="h-5 w-5" />
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default Tutorial

