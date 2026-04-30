'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, PenTool, Send, CheckCircle, AlertCircle, Clock, Target, TrendingUp } from 'lucide-react'
import { useRouter } from 'next/navigation'
import SimpleHeader from '@/components/SimpleHeader'
import Footer from '@/components/Footer'

export default function TreinoRedacaoPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [courseData, setCourseData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState('')
  const [essay, setEssay] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [feedback, setFeedback] = useState<any>(null)
  const [wordCount, setWordCount] = useState(0)

  useEffect(() => {
    // Simular carregamento de dados do curso e tema
    const loadTreinoData = async () => {
      setLoading(true)
      
      // Temas mockados para redação
      const themes = [
        "O impacto das redes sociais na democracia contemporânea",
        "Desenvolvimento sustentável: desafios e oportunidades para o Brasil",
        "A importância da educação para o desenvolvimento social e econômico",
        "Tecnologia e mercado de trabalho: adaptação ou resistência?",
        "Políticas públicas de segurança: equilíbrio entre liberdade e proteção"
      ]
      
      const randomTheme = themes[Math.floor(Math.random() * themes.length)]
      
      const courseTitle = decodeURIComponent(params.id).replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      
      setCourseData({
        id: params.id,
        title: courseTitle,
        organization: "Comissão de Concurso Público",
        status: "Aberto"
      })
      
      setTheme(randomTheme)
      setLoading(false)
    }

    loadTreinoData()
  }, [params.id])

  useEffect(() => {
    // Contar palavras do texto
    const words = essay.trim().split(/\s+/).filter(word => word.length > 0)
    setWordCount(words.length)
  }, [essay])

  const analyzeEssay = async () => {
    if (!essay.trim()) return
    
    setAnalyzing(true)
    
    // Simular análise da IA
    setTimeout(() => {
      const mockFeedback = {
        score: Math.floor(Math.random() * 300) + 600, // 600-900 pontos
        strengths: [
          "Boa estrutura textual com introdução, desenvolvimento e conclusão",
          "Argumentos bem fundamentados com exemplos relevantes",
          "Linguagem adequada ao gênero dissertativo-argumentativo"
        ],
        improvements: [
          "Aprofundar a análise dos argumentos com mais dados estatísticos",
          "Desenvolver melhor a proposta de intervenção",
          "Atenção à coesão e coerência em alguns parágrafos"
        ],
        suggestions: [
          "Revise a concordância verbal e nominal",
          "Varie mais os conectivos para melhorar a fluidez",
          "Desenvolva a proposta de intervenção com mais detalhes"
        ],
        grammar: [
          "2 erros de ortografia",
          "1 erro de concordância verbal",
          "3 problemas de acentuação"
        ]
      }
      
      setFeedback(mockFeedback)
      setAnalyzing(false)
    }, 3000)
  }

  const resetEssay = () => {
    setEssay('')
    setFeedback(null)
    // Gerar novo tema
    const themes = [
      "O impacto das redes sociais na democracia contemporânea",
      "Desenvolvimento sustentável: desafios e oportunidades para o Brasil",
      "A importância da educação para o desenvolvimento social e econômico",
      "Tecnologia e mercado de trabalho: adaptação ou resistência?",
      "Políticas públicas de segurança: equilíbrio entre liberdade e proteção"
    ]
    const newTheme = themes[Math.floor(Math.random() * themes.length)]
    setTheme(newTheme)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (!courseData) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Treino de Redação não encontrado</h1>
          <button
            onClick={() => router.push('/cursos')}
            className="px-6 py-2 bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
          >
            Voltar para busca
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <SimpleHeader />
      
      <section className="relative py-20">
        {/* Background Pattern */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-slate-950"></div>
          <div className="absolute inset-0 opacity-20">
            <div className="absolute inset-0" style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 1px)`,
              backgroundSize: '40px 40px'
            }}></div>
          </div>
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-8"
          >
            <button
              onClick={() => router.push(`/curso/${params.id}`)}
              className="mb-6 inline-flex items-center text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar para {courseData.title}
            </button>

            <div className="text-center">
              <h1 className="text-3xl md:text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Treino de Redação
              </h1>
              <p className="text-gray-300">
                {courseData.title} - Feedback inteligente por IA
              </p>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Área de Escrita */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="space-y-6"
            >
              {/* Tema */}
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <Target className="w-5 h-5 mr-2 text-blue-400" />
                  Tema da Redação
                </h3>
                <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                  <p className="text-blue-300 font-medium">{theme}</p>
                </div>
                <button
                  onClick={resetEssay}
                  className="mt-4 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Gerar novo tema
                </button>
              </div>

              {/* Editor */}
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold flex items-center">
                    <PenTool className="w-5 h-5 mr-2 text-purple-400" />
                    Sua Redação
                  </h3>
                  <div className="text-sm text-gray-400">
                    {wordCount} palavras
                  </div>
                </div>
                
                <textarea
                  value={essay}
                  onChange={(e) => setEssay(e.target.value)}
                  placeholder="Digite sua redação aqui..."
                  className="w-full h-96 p-4 bg-slate-700 rounded-lg border border-slate-600 text-white placeholder-gray-400 resize-none focus:outline-none focus:border-blue-500 transition-colors"
                />
                
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-gray-400">
                    Mínimo recomendado: 20 linhas
                  </div>
                  <button
                    onClick={analyzeEssay}
                    disabled={!essay.trim() || analyzing}
                    className="px-6 py-2 bg-purple-500 rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {analyzing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Analisando...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Analisar Redação
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>

            {/* Área de Feedback */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="space-y-6"
            >
              {feedback ? (
                <>
                  {/* Pontuação */}
                  <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center">
                      <Target className="w-5 h-5 mr-2 text-green-400" />
                      Pontuação
                    </h3>
                    <div className="text-center">
                      <div className={`text-4xl font-bold mb-2 ${
                        feedback.score >= 800 ? 'text-green-400' :
                        feedback.score >= 600 ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {feedback.score}
                      </div>
                      <div className="text-sm text-gray-400">
                        {feedback.score >= 800 ? 'Excelente' :
                         feedback.score >= 600 ? 'Bom' :
                         'Precisa melhorar'}
                      </div>
                    </div>
                  </div>

                  {/* Pontos Fortes */}
                  <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2 text-green-400" />
                      Pontos Fortes
                    </h3>
                    <ul className="space-y-2">
                      {feedback.strengths.map((strength: string, index: number) => (
                        <li key={index} className="flex items-start">
                          <CheckCircle className="w-4 h-4 text-green-400 mr-2 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-300 text-sm">{strength}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Melhorias */}
                  <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center">
                      <AlertCircle className="w-5 h-5 mr-2 text-yellow-400" />
                      O que Melhorar
                    </h3>
                    <ul className="space-y-2">
                      {feedback.improvements.map((improvement: string, index: number) => (
                        <li key={index} className="flex items-start">
                          <AlertCircle className="w-4 h-4 text-yellow-400 mr-2 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-300 text-sm">{improvement}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Sugestões */}
                  <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center">
                      <TrendingUp className="w-5 h-5 mr-2 text-blue-400" />
                      Sugestões da IA
                    </h3>
                    <ul className="space-y-2">
                      {feedback.suggestions.map((suggestion: string, index: number) => (
                        <li key={index} className="flex items-start">
                          <TrendingUp className="w-4 h-4 text-blue-400 mr-2 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-300 text-sm">{suggestion}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Gramática */}
                  <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center">
                      <AlertCircle className="w-5 h-5 mr-2 text-red-400" />
                      Gramática e Ortografia
                    </h3>
                    <ul className="space-y-2">
                      {feedback.grammar.map((error: string, index: number) => (
                        <li key={index} className="flex items-start">
                          <AlertCircle className="w-4 h-4 text-red-400 mr-2 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-300 text-sm">{error}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : (
                <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
                  <PenTool className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">Aguardando sua redação</h3>
                  <p className="text-gray-400">
                    Escreva sua redação e clique em "Analisar Redação" para receber feedback detalhado da IA.
                  </p>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
