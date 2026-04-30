'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, CheckCircle2, Circle, BookOpen, Clock, Target, TrendingUp } from 'lucide-react'
import { useRouter } from 'next/navigation'
import SimpleHeader from '@/components/SimpleHeader'
import Footer from '@/components/Footer'

// Definir interfaces para TypeScript
interface Topic {
  id: number
  title: string
  description: string
  completed: boolean
}

interface Module {
  id: number
  title: string
  topics: Topic[]
}

interface CourseData {
  id: string
  title: string
  organization: string
  status: string
  deadline: string
}

export default function EditalVerticalizadoPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [courseData, setCourseData] = useState<CourseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [modules, setModules] = useState<Module[]>([])
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    // Carregar dados do edital verticalizado gerado por IA baseado no curso
    const loadEditalData = async () => {
      setLoading(true)
      
      const courseTitle = decodeURIComponent(params.id).replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      
      try {
        // Gerar edital verticalizado usando Gemini API
        const prompt = `Gere um edital verticalizado completo e estruturado para o concurso: "${courseTitle}".
        
        REGRAS:
        1. Crie um edital REAL e atualizado para este concurso
        2. Inclua apenas matérias relevantes para este tipo de concurso
        3. Para cada matéria, crie 5-8 tópicos específicos
        4. Os tópicos devem ser progressivos e lógicos
        5. Adapte o conteúdo ao nível do concurso (médio/superior)
        
        ESTRUTURA JSON:
        {
          "course": "${courseTitle}",
          "modules": [
            {
              "title": "Nome da Matéria",
              "topics": [
                {"title": "Tópico 1", "description": "Breve descrição"},
                {"title": "Tópico 2", "description": "Breve descrição"}
              ]
            }
          ]
        }
        
        IMPORTANTE: Retorne APENAS o JSON válido, sem texto adicional.`

        const response = await fetch('/api/generate-edital', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt })
        })
        
        if (response.ok) {
          const data = await response.json()
          const editalData = JSON.parse(data.content)
          
          // Processar os módulos e tópicos
          const processedModules = editalData.modules.map((module: any, index: number) => ({
            id: index + 1,
            title: module.title,
            topics: module.topics.map((topic: any, topicIndex: number) => ({
              id: index * 10 + topicIndex + 1,
              title: topic.title,
              description: topic.description,
              completed: false
            }))
          }))
          
          setCourseData({
            id: params.id,
            title: courseTitle,
            organization: "Comissão de Concurso Público",
            status: "Aberto",
            deadline: "A ser divulgado"
          })
          
          setModules(processedModules)
          calculateProgress(processedModules)
        } else {
          throw new Error('Falha ao gerar edital')
        }
      } catch (error) {
        console.error('Erro ao gerar edital:', error)
        
        // Fallback para edital mockado personalizado
        const getPersonalizedModules = (courseName: string) => {
          if (courseName.toLowerCase().includes('polícia') || courseName.toLowerCase().includes('federal')) {
            return [
              {
                id: 1,
                title: "Língua Portuguesa",
                topics: [
                  { id: 1, title: "Compreensão e interpretação de textos", description: "Análise de textos diversos", completed: false },
                  { id: 2, title: "Gramática aplicada", description: "Regras gramaticais", completed: false },
                  { id: 3, title: "Ortografia oficial", description: "Regras ortográficas", completed: false },
                  { id: 4, title: "Redação oficial", description: "Normas da redação oficial", completed: false },
                  { id: 5, title: "Semântica e pragmática", description: "Estudo de significados", completed: false }
                ]
              },
              {
                id: 2,
                title: "Direito Constitucional",
                topics: [
                  { id: 6, title: "Dos Direitos Fundamentais", description: "Artigos 5º ao 17º", completed: false },
                  { id: 7, title: "Da Organização do Estado", description: "Artigos 18º ao 43º", completed: false },
                  { id: 8, title: "Da Organização dos Poderes", description: "Artigos 44º ao 75º", completed: false },
                  { id: 9, title: "Das Funções Essenciais", description: "Artigos 175 ao 179", completed: false },
                  { id: 10, title: "Da Defesa do Estado", description: "Artigos 136 ao 144", completed: false }
                ]
              },
              {
                id: 3,
                title: "Direito Administrativo",
                topics: [
                  { id: 11, title: "Atos Administrativos", description: "Conceitos e classificação", completed: false },
                  { id: 12, title: "Organização Administrativa", description: "Estrutura administrativa", completed: false },
                  { id: 13, title: "Servidores Públicos", description: "Regime jurídico", completed: false },
                  { id: 14, title: "Controle da Administração", description: "Tipos de controle", completed: false },
                  { id: 15, title: "Responsabilidade Civil", description: "Responsabilidade do Estado", completed: false }
                ]
              },
              {
                id: 4,
                title: "Raciocínio Lógico",
                topics: [
                  { id: 16, title: "Estruturas lógicas", description: "Proposições e conectivos", completed: false },
                  { id: 17, title: "Lógica de argumentação", description: "Análise de argumentos", completed: false },
                  { id: 18, title: "Análise combinatória", description: "Permutações e combinações", completed: false },
                  { id: 19, title: "Probabilidade", description: "Cálculos probabilísticos", completed: false },
                  { id: 20, title: "Problemas lógicos", description: "Resolução de problemas", completed: false }
                ]
              },
              {
                id: 5,
                title: "Atualidades",
                topics: [
                  { id: 21, title: "Política nacional", description: "Cenário político atual", completed: false },
                  { id: 22, title: "Economia brasileira", description: "Indicadores econômicos", completed: false },
                  { id: 23, title: "Segurança pública", description: "Políticas de segurança", completed: false },
                  { id: 24, title: "Tecnologia e inovação", description: "Avanços tecnológicos", completed: false },
                  { id: 25, title: "Relações internacionais", description: "Política externa brasileira", completed: false }
                ]
              }
            ]
          } else if (courseName.toLowerCase().includes('banco') || courseName.toLowerCase().includes('caixa')) {
            return [
              {
                id: 1,
                title: "Língua Portuguesa",
                topics: [
                  { id: 1, title: "Interpretação de textos", description: "Textos bancários", completed: false },
                  { id: 2, title: "Gramática", description: "Regras gramaticais", completed: false },
                  { id: 3, title: "Redação oficial", description: "Documentos bancários", completed: false },
                  { id: 4, title: "Correspondência oficial", description: "Normas de correspondência", completed: false },
                  { id: 5, title: "Atos normativos", description: "Lei e regulamentos", completed: false }
                ]
              },
              {
                id: 2,
                title: "Matemática Financeira",
                topics: [
                  { id: 6, title: "Juros simples", description: "Cálculo de juros simples", completed: false },
                  { id: 7, title: "Juros compostos", description: "Cálculo de juros compostos", completed: false },
                  { id: 8, title: "Taxas equivalentes", description: "Conversão de taxas", completed: false },
                  { id: 9, title: "Séries de pagamento", description: "Prestações e amortização", completed: false },
                  { id: 10, title: "Sistemas de amortização", description: "PRICE, SAC, etc", completed: false }
                ]
              },
              {
                id: 3,
                title: "Noções de Informática",
                topics: [
                  { id: 11, title: "Hardware", description: "Componentes físicos", completed: false },
                  { id: 12, title: "Software", description: "Programas e aplicativos", completed: false },
                  { id: 13, title: "Redes de computadores", description: "Conceitos de rede", completed: false },
                  { id: 14, title: "Internet", description: "Tecnologias web", completed: false },
                  { id: 15, title: "Segurança da informação", description: "Proteção de dados", completed: false }
                ]
              },
              {
                id: 4,
                title: "Raciocínio Lógico",
                topics: [
                  { id: 16, title: "Lógica proposicional", description: "Proposições lógicas", completed: false },
                  { id: 17, title: "Análise combinatória", description: "Arranjos e permutações", completed: false },
                  { id: 18, title: "Probabilidade", description: "Cálculos de probabilidade", completed: false },
                  { id: 19, title: "Estatística", description: "Análise estatística", completed: false },
                  { id: 20, title: "Problemas lógicos", description: "Raciocínio lógico", completed: false }
                ]
              },
              {
                id: 5,
                title: "Atualidades do Mercado Financeiro",
                topics: [
                  { id: 21, title: "Economia brasileira", description: "Indicadores econômicos", completed: false },
                  { id: 22, title: "Sistema financeiro nacional", description: "Bancos e instituições", completed: false },
                  { id: 23, title: "Política monetária", description: "Banco Central e taxas", completed: false },
                  { id: 24, title: "Mercado de capitais", description: "Bolsa de valores", completed: false },
                  { id: 25, title: "Tecnologia financeira", description: "Fintechs e inovações", completed: false }
                ]
              }
            ]
          } else {
            // Edital genérico para outros concursos
            return [
              {
                id: 1,
                title: "Língua Portuguesa",
                topics: [
                  { id: 1, title: "Compreensão e interpretação de textos", description: "Análise textual", completed: false },
                  { id: 2, title: "Tipologia textual", description: "Tipos de textos", completed: false },
                  { id: 3, title: "Ortografia oficial", description: "Regras ortográficas", completed: false },
                  { id: 4, title: "Acentuação gráfica", description: "Regras de acentuação", completed: false },
                  { id: 5, title: "Pontuação", description: "Uso de sinais de pontuação", completed: false }
                ]
              },
              {
                id: 2,
                title: "Matemática",
                topics: [
                  { id: 6, title: "Conjuntos numéricos", description: "Números naturais, inteiros, racionais", completed: false },
                  { id: 7, title: "Operações fundamentais", description: "Adição, subtração, multiplicação, divisão", completed: false },
                  { id: 8, title: "Porcentagem", description: "Cálculo percentual", completed: false },
                  { id: 9, title: "Regra de três", description: "Proporcionalidade", completed: false },
                  { id: 10, title: "Juros simples e compostos", description: "Cálculo financeiro básico", completed: false }
                ]
              },
              {
                id: 3,
                title: "Noções de Informática",
                topics: [
                  { id: 11, title: "Hardware e software", description: "Componentes e programas", completed: false },
                  { id: 12, title: "Sistemas operacionais", description: "Windows, Linux, macOS", completed: false },
                  { id: 13, title: "Processador de texto", description: "Microsoft Word, LibreOffice Writer", completed: false },
                  { id: 14, title: "Planilha eletrônica", description: "Microsoft Excel, LibreOffice Calc", completed: false },
                  { id: 15, title: "Internet e redes sociais", description: "Tecnologias web", completed: false }
                ]
              },
              {
                id: 4,
                title: "Raciocínio Lógico",
                topics: [
                  { id: 16, title: "Estruturas lógicas", description: "Proposições e conectivos", completed: false },
                  { id: 17, title: "Lógica de argumentação", description: "Análise de argumentos", completed: false },
                  { id: 18, title: "Análise de diagramas", description: "Interpretação de gráficos", completed: false },
                  { id: 19, title: "Sequências lógicas", description: "Padrões e sequências", completed: false },
                  { id: 20, title: "Problemas de raciocínio", description: "Resolução de problemas", completed: false }
                ]
              },
              {
                id: 5,
                title: "Atualidades",
                topics: [
                  { id: 21, title: "Política nacional e internacional", description: "Cenário político atual", completed: false },
                  { id: 22, title: "Economia brasileira", description: "Indicadores econômicos", completed: false },
                  { id: 23, title: "Meio ambiente", description: "Questões ambientais", completed: false },
                  { id: 24, title: "Tecnologia e inovação", description: "Avanços tecnológicos", completed: false },
                  { id: 25, title: "Cultura e sociedade", description: "Manifestações culturais", completed: false }
                ]
              }
            ]
          }
          
          setCourseData({
            id: params.id,
            title: courseTitle,
            organization: "Comissão de Concurso Público",
            status: "Aberto",
            deadline: "A ser divulgado"
          })
          
          setModules(getPersonalizedModules(courseTitle))
          calculateProgress(getPersonalizedModules(courseTitle))
        }
        
        setLoading(false)
      }

    loadEditalData()
  }, [params.id])

  const calculateProgress = (modulesData: Module[]) => {
    const totalTopics = modulesData.reduce((acc, module) => acc + module.topics.length, 0)
    const completedTopics = modulesData.reduce((acc, module) => 
      acc + module.topics.filter((topic: Topic) => topic.completed).length, 0
    )
    const progressPercentage = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0
    setProgress(progressPercentage)
  }

  const toggleTopic = (moduleId: number, topicId: number) => {
    setModules(prevModules => {
      const updatedModules = prevModules.map(module => {
        if (module.id === moduleId) {
          return {
            ...module,
            topics: module.topics.map(topic => 
              topic.id === topicId ? { ...topic, completed: !topic.completed } : topic
            )
          }
        }
        return module
      })
      calculateProgress(updatedModules)
      return updatedModules
    })
  }

  const toggleModule = (moduleId: number) => {
    setModules(prevModules => {
      const updatedModules = prevModules.map(module => {
        if (module.id === moduleId) {
          const allCompleted = module.topics.every(topic => topic.completed)
          return {
            ...module,
            topics: module.topics.map(topic => ({ ...topic, completed: !allCompleted }))
          }
        }
        return module
      })
      calculateProgress(updatedModules)
      return updatedModules
    })
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
          <h1 className="text-2xl font-bold mb-4">Edital não encontrado</h1>
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

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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

            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  Edital Verticalizado
                </h1>
                <p className="text-gray-300">
                  {courseData.title} - {courseData.organization}
                </p>
              </div>
              
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-400">{progress}%</div>
                <div className="text-sm text-gray-400">Concluído</div>
              </div>
            </div>
          </motion.div>

          {/* Progress Bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-8"
          >
            <div className="w-full bg-slate-700 rounded-full h-3">
              <div 
                className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </motion.div>

          {/* Modules */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="space-y-6"
          >
            {modules.map((module, moduleIndex) => {
              const moduleCompleted = module.topics.every(topic => topic.completed)
              const moduleProgress = Math.round((module.topics.filter(topic => topic.completed).length / module.topics.length) * 100)
              
              return (
                <motion.div
                  key={module.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.1 * moduleIndex }}
                  className="bg-slate-800 rounded-xl border border-slate-700 p-6"
                >
                  <div 
                    className="flex items-center justify-between mb-4 cursor-pointer"
                    onClick={() => toggleModule(module.id)}
                  >
                    <div className="flex items-center">
                      <button className="mr-3">
                        {moduleCompleted ? (
                          <CheckCircle2 className="w-6 h-6 text-green-400" />
                        ) : (
                          <Circle className="w-6 h-6 text-gray-400" />
                        )}
                      </button>
                      <div>
                        <h3 className="text-xl font-semibold">{module.title}</h3>
                        <p className="text-sm text-gray-400">
                          {module.topics.filter(topic => topic.completed).length} de {module.topics.length} tópicos concluídos
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-lg font-semibold text-blue-400">{moduleProgress}%</div>
                        <div className="text-xs text-gray-400">Módulo</div>
                      </div>
                      <BookOpen className="w-5 h-5 text-gray-400" />
                    </div>
                  </div>

                  <div className="w-full bg-slate-700 rounded-full h-2 mb-4">
                    <div 
                      className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${moduleProgress}%` }}
                    ></div>
                  </div>

                  <div className="space-y-2">
                    {module.topics.map((topic, topicIndex) => (
                      <motion.div
                        key={topic.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, delay: 0.05 * topicIndex }}
                        className="flex items-center p-3 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors cursor-pointer"
                        onClick={() => toggleTopic(module.id, topic.id)}
                      >
                        <button className="mr-3">
                          {topic.completed ? (
                            <CheckCircle2 className="w-5 h-5 text-green-400" />
                          ) : (
                            <Circle className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                        <span className={`flex-1 ${topic.completed ? 'text-gray-400 line-through' : 'text-white'}`}>
                          {topic.title}
                        </span>
                        {topic.completed && (
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                        )}
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )
            })}
          </motion.div>

          {/* Statistics */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 text-center">
              <Target className="w-8 h-8 text-blue-400 mx-auto mb-3" />
              <div className="text-2xl font-bold text-white mb-1">
                {modules.reduce((acc, module) => acc + module.topics.length, 0)}
              </div>
              <div className="text-sm text-gray-400">Total de Tópicos</div>
            </div>
            
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 text-center">
              <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-3" />
              <div className="text-2xl font-bold text-white mb-1">
                {modules.reduce((acc, module) => acc + module.topics.filter(topic => topic.completed).length, 0)}
              </div>
              <div className="text-sm text-gray-400">Tópicos Concluídos</div>
            </div>
            
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 text-center">
              <Clock className="w-8 h-8 text-purple-400 mx-auto mb-3" />
              <div className="text-2xl font-bold text-white mb-1">
                {modules.reduce((acc, module) => acc + module.topics.filter(topic => !topic.completed).length, 0)}
              </div>
              <div className="text-sm text-gray-400">Tópicos Restantes</div>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
