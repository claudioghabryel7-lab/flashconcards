'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, BookOpen, FileText, PenTool, HelpCircle, Brain, CheckCircle, Clock, Users, Star, TrendingUp } from 'lucide-react'
import { useRouter } from 'next/navigation'
import SimpleHeader from '@/components/SimpleHeader'
import Footer from '@/components/Footer'

export default function CursoPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [courseData, setCourseData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simular carregamento de dados do curso
    const loadCourseData = async () => {
      setLoading(true)
      
      // Dados mockados baseados no ID do curso
      const mockData = {
        id: params.id,
        title: decodeURIComponent(params.id).replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        organization: "Comissão de Concurso Público",
        status: "Aberto",
        deadline: "A ser divulgado",
        link: "Site oficial do concurso",
        description: "Concurso público com vagas em diversas áreas. Processo seletivo com provas objetivas e análise de currículo.",
        progress: 0
      }
      
      setCourseData(mockData)
      setLoading(false)
    }

    loadCourseData()
  }, [params.id])

  const options = [
    {
      id: 'edital-verticalizado',
      title: 'Edital Verticalizado',
      description: 'Edital completo estruturado com checkboxes para marcar como estudado e acompanhar seu progresso',
      icon: FileText,
      color: 'from-blue-500 to-blue-600',
      route: `/curso/${params.id}/edital-verticalizado`
    },
    {
      id: 'flashcards',
      title: 'Flashcards',
      description: 'Flashcards inteligentes gerados por IA baseados no edital do concurso para otimizar seus estudos',
      icon: BookOpen,
      color: 'from-green-500 to-green-600',
      route: `/curso/${params.id}/flashcards`
    },
    {
      id: 'treino-redacao',
      title: 'Treino de Redação',
      description: 'Treine suas habilidades de redação com feedback personalizado da inteligência artificial',
      icon: PenTool,
      color: 'from-purple-500 to-purple-600',
      route: `/curso/${params.id}/treino-redacao`
    },
    {
      id: 'questoes',
      title: 'Questões',
      description: 'Banco de questões personalizadas baseado na banca examinadora e no concurso específico',
      icon: HelpCircle,
      color: 'from-orange-500 to-orange-600',
      route: `/curso/${params.id}/questoes`
    },
    {
      id: 'mapas-mentais',
      title: 'Mapas Mentais',
      description: 'Mapas mentais gerados por IA para organizar visualmente o conteúdo do edital',
      icon: Brain,
      color: 'from-pink-500 to-pink-600',
      route: `/curso/${params.id}/mapas-mentais`
    }
  ]

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
          <h1 className="text-2xl font-bold mb-4">Curso não encontrado</h1>
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
          {/* Header do Curso */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <button
              onClick={() => router.back()}
              className="mb-6 inline-flex items-center text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </button>

            <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              {courseData.title}
            </h1>
            
            <div className="flex flex-wrap justify-center gap-4 text-sm text-gray-300 mb-6">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                {courseData.organization}
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                {courseData.status}
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {courseData.deadline}
              </div>
            </div>

            <p className="text-gray-300 max-w-2xl mx-auto">
              {courseData.description}
            </p>
          </motion.div>

          {/* Grid de Opções */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {options.map((option, index) => {
              const Icon = option.icon
              return (
                <motion.div
                  key={option.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.1 * index }}
                  whileHover={{ y: -5 }}
                  className="group"
                >
                  <button
                    onClick={() => router.push(option.route)}
                    className="w-full p-6 bg-slate-800 rounded-xl border border-slate-700 hover:border-slate-600 transition-all duration-300 text-left"
                  >
                    <div className={`w-12 h-12 rounded-lg bg-gradient-to-r ${option.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    
                    <h3 className="text-xl font-semibold mb-2 group-hover:text-blue-400 transition-colors">
                      {option.title}
                    </h3>
                    
                    <p className="text-gray-400 text-sm leading-relaxed">
                      {option.description}
                    </p>

                    <div className="mt-4 flex items-center text-blue-400 text-sm font-medium">
                      <span>Acessar</span>
                      <TrendingUp className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform duration-300" />
                    </div>
                  </button>
                </motion.div>
              )
            })}
          </motion.div>

          {/* Progresso Geral */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-12 p-6 bg-slate-800 rounded-xl border border-slate-700"
          >
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <Star className="w-5 h-5 mr-2 text-yellow-400" />
              Seu Progresso Geral
            </h3>
            
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Progresso Total</span>
                  <span>{courseData.progress}%</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${courseData.progress}%` }}
                  ></div>
                </div>
              </div>
              
              <p className="text-sm text-gray-400">
                Continue estudando para aumentar seu progresso e dominar o conteúdo do concurso!
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
