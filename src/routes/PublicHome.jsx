import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, query, setDoc, serverTimestamp, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import LazyImage from '../components/LazyImage'
import { 
  ShieldCheckIcon, 
  SparklesIcon, 
  ClockIcon,
  AcademicCapIcon,
  ChartBarIcon,
  TrophyIcon,
  LightBulbIcon,
  QuestionMarkCircleIcon,
  CalendarIcon,
  ChatBubbleLeftRightIcon,
  BookOpenIcon,
  RocketLaunchIcon,
  ShareIcon
} from '@heroicons/react/24/solid'
import { trackButtonClick } from '../utils/googleAds'
import HomeBanner from '../components/HomeBanner'
import Reviews from '../components/Reviews'
import NewsSection from '../components/NewsSection'

const features = [
  {
    icon: BookOpenIcon,
    title: 'Flashcards Inteligentes',
    description: 'Sistema de repetição espaçada (SRS) que adapta o ritmo de estudos ao seu desempenho. Mais de 8 matérias completas com módulos organizados.',
    color: 'from-blue-500 to-blue-600'
  },
  {
    icon: QuestionMarkCircleIcon,
    title: 'FlashQuestões',
    description: 'Questões fictícias no estilo das principais bancas geradas por IA. Questões personalizadas por módulo com explicações detalhadas (BIZUs) e índice de acerto.',
    color: 'from-purple-500 to-purple-600'
  },
  {
    icon: ChatBubbleLeftRightIcon,
    title: 'Flash Mentor - IA Personalizada',
    description: 'Assistente de IA que responde dúvidas sobre o edital, explica conceitos e orienta seus estudos 24/7. Baseado no edital do concurso.',
    color: 'from-green-500 to-green-600'
  },
  {
    icon: RocketLaunchIcon,
    title: 'Como Estudar? - Bot Guia',
    description: 'Bot inteligente que analisa seu progresso e sugere qual módulo estudar. Acompanha fases de estudo e calcula dias restantes para completar tudo.',
    color: 'from-orange-500 to-orange-600'
  },
  {
    icon: TrophyIcon,
    title: 'Ranking de Alunos',
    description: 'Competição saudável com ranking em tempo real. Veja sua posição, horas estudadas e dias de dedicação comparados com outros alunos.',
    color: 'from-yellow-500 to-yellow-600'
  },
  {
    icon: ChartBarIcon,
    title: 'Progresso Completo',
    description: 'Acompanhe seu progresso com calendário visual, streak de estudos, estatísticas por matéria e visualização clara do que já foi estudado.',
    color: 'from-indigo-500 to-indigo-600'
  },
  {
    icon: CalendarIcon,
    title: 'Calendário de Progresso',
    description: 'Visualize todos os dias que você estudou em um calendário interativo. Mantenha sua sequência de estudos e aumente seu streak.',
    color: 'from-pink-500 to-pink-600'
  },
  {
    icon: LightBulbIcon,
    title: 'Explicações com IA',
    description: 'Receba explicações detalhadas de cada flashcard geradas por IA, contextualizadas com o edital do concurso para melhor compreensão.',
    color: 'from-teal-500 to-teal-600'
  }
]

const benefits = [
  'Flashcards com sistema de repetição espaçada (SRS)',
  'FlashQuestões geradas por IA no estilo das principais bancas',
  'Flash Mentor - IA que responde dúvidas sobre o edital',
  'Bot "Como Estudar?" - guia personalizado de estudos',
  'Ranking em tempo real com outros alunos',
  'Progresso completo com estatísticas e métricas',
  'Calendário visual e streak de estudos',
  'Explicações detalhadas geradas por IA',
]

const PublicHome = () => {
  // Número do WhatsApp (formato: código do país + DDD + número, sem espaços ou caracteres especiais)
  const whatsappNumber = '5562981841878'
  const whatsappMessage = encodeURIComponent('Olá! Gostaria de saber mais sobre os cursos preparatórios disponíveis.')
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`
  
  // Carregar cursos
  const [courses, setCourses] = useState([])
  const [loadingCourses, setLoadingCourses] = useState(true)

  useEffect(() => {
    // Tentar carregar do cache primeiro
    const cacheKey = 'courses_active'
    try {
      const cached = localStorage.getItem(`firebase_cache_${cacheKey}`)
      if (cached) {
        const { data: cachedData, timestamp } = JSON.parse(cached)
        const now = Date.now()
        if (now - timestamp < 5 * 60 * 1000 && cachedData) {
          // Ordenar: cursos em destaque primeiro, depois os outros
          const sortedCached = cachedData.sort((a, b) => {
            if (a.featured === true && b.featured !== true) return -1
            if (a.featured !== true && b.featured === true) return 1
            return 0
          })
          setCourses(sortedCached)
          setLoadingCourses(false)
        }
      }
    } catch (err) {
      console.warn('Erro ao ler cache de cursos:', err)
    }
    
    const coursesRef = collection(db, 'courses')
    const q = query(coursesRef, where('active', '==', true))
    let retryCount = 0
    const maxRetries = 3
    
    const loadData = () => {
    const unsub = onSnapshot(q, async (snapshot) => {
      const data = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }))
      
      // Ordenar: cursos em destaque primeiro, depois os outros
      const sortedData = data.sort((a, b) => {
        // Cursos destacados primeiro
        if (a.featured === true && b.featured !== true) return -1
        if (a.featured !== true && b.featured === true) return 1
        // Se ambos destacados ou ambos não destacados, manter ordem original
        return 0
      })
      
      setCourses(sortedData)
      setLoadingCourses(false)
        retryCount = 0
        
        // Preload das primeiras 3 imagens de cursos (acima da dobra)
        sortedData.slice(0, 3).forEach((course) => {
          const imageUrl = course.imageBase64 || course.imageUrl
          if (imageUrl) {
            const link = document.createElement('link')
            link.rel = 'preload'
            link.as = 'image'
            link.href = imageUrl
            document.head.appendChild(link)
          }
        })
        
        // Salvar no cache (com ordenação)
        try {
          localStorage.setItem(`firebase_cache_${cacheKey}`, JSON.stringify({
            data: sortedData,
            timestamp: Date.now(),
          }))
        } catch (err) {
          console.warn('Erro ao salvar cache de cursos:', err)
        }
    }, (error) => {
      console.error('Erro ao carregar cursos:', error)
        
        // Retry logic
        if (retryCount < maxRetries) {
          retryCount++
          setTimeout(() => {
            loadData()
          }, 1000 * retryCount)
        } else {
      setCourses([])
      setLoadingCourses(false)
        }
    })
      return unsub
    }

    const unsub = loadData()
    return () => unsub()
  }, [])

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  }

  return (
    <section className="space-y-6 sm:space-y-8 md:space-y-12 px-2 sm:px-0">
      {/* Carrossel de Banners */}
      <HomeBanner />
      
      {/* Cursos Disponíveis - Movido para o início */}
      {courses.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, type: "spring", stiffness: 100 }}
          className="space-y-6"
        >
          <motion.div 
            className="text-center"
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, type: "spring" }}
          >
            <motion.h2 
              className="text-2xl sm:text-3xl md:text-4xl font-black text-alego-700 dark:text-alego-300 mb-3"
              initial={{ opacity: 0, y: -20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              Cursos Preparatórios Disponíveis
            </motion.h2>
            <motion.p 
              className="text-slate-600 dark:text-slate-400 text-sm sm:text-base"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              Escolha o curso ideal para sua aprovação
            </motion.p>
          </motion.div>
          <div className="grid gap-6 sm:gap-8 md:grid-cols-2 lg:grid-cols-3">
            {courses.map((course, index) => {
              const direction = index % 3 === 0 ? -50 : index % 3 === 1 ? 50 : 0
              return (
                <motion.div
                  key={course.id}
                  initial={{ 
                    opacity: 0, 
                    y: 60,
                    x: direction,
                    scale: 0.9
                  }}
                  whileInView={{ 
                    opacity: 1, 
                    y: 0,
                    x: 0,
                    scale: 1
                  }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ 
                    duration: 0.7, 
                    delay: index * 0.15,
                    type: "spring",
                    stiffness: 100
                  }}
                  className="group relative overflow-hidden rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl shadow-lg hover:shadow-2xl border border-slate-200/50 dark:border-slate-700/50"
                  whileHover={{ scale: 1.05, y: -10, rotate: 1 }}
                >
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-cyan-500/10 opacity-10 rounded-full blur-2xl group-hover:opacity-30 transition-all duration-500"></div>
                <div className="relative z-10">
                  {/* Imagem do curso */}
                  {(course.imageBase64 || course.imageUrl) && (
                    <div className="w-full h-48 overflow-hidden rounded-t-2xl">
                      <LazyImage
                        src={course.imageBase64 || course.imageUrl}
                        alt={course.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        priority={index < 3}
                      />
                    </div>
                  )}
                  
                  <div className="p-6">
                    <div className="mb-3 flex items-center gap-2 flex-wrap">
                      {course.featured && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 px-3 py-1 text-xs font-black text-white shadow-lg animate-pulse">
                          ⭐ Mais Vendido
                        </span>
                      )}
                      <span className="inline-block rounded-full bg-blue-100 dark:bg-blue-900/50 px-3 py-1 text-xs font-bold text-blue-700 dark:text-blue-300">
                        {course.competition}
                      </span>
                    </div>
                    
                    <h3 className="text-xl font-bold text-alego-700 dark:text-alego-300 mb-2">
                      {course.name}
                    </h3>
                    
                    {course.description && (
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 line-clamp-2">
                        {course.description}
                      </p>
                    )}
                    
                    <div className="mb-4">
                      {course.originalPrice && course.originalPrice > course.price && (
                        <p className="text-sm text-slate-400 line-through mb-1">
                          {formatCurrency(course.originalPrice)}
                        </p>
                      )}
                      <p className="text-2xl font-black text-alego-600 dark:text-alego-400">
                        {formatCurrency(course.price || 99.90)}
                      </p>
                      {course.courseDuration && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          ⏱️ Duração: {course.courseDuration}
                        </p>
                      )}
                    </div>
                    
                    <motion.div 
                      className="flex gap-2"
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5, delay: index * 0.15 + 0.3 }}
                    >
                      <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                        <Link
                          to={`/pagamento?course=${course.id}`}
                          onClick={trackButtonClick}
                          className="flex-1 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-3 text-center text-sm font-bold text-white shadow-lg hover:shadow-xl hover:from-blue-500 hover:to-purple-500 transition-all block"
                        >
                          Comprar Agora
                        </Link>
                      </motion.div>
                      <motion.button
                        whileHover={{ scale: 1.1, rotate: 15 }}
                        whileTap={{ scale: 0.9 }}
                        type="button"
                        onClick={async (e) => {
                          e.preventDefault()
                          const shareUrl = `${window.location.origin}/curso/${course.id}`
                          
                          if (navigator.share) {
                            try {
                              await navigator.share({
                                title: course.name,
                                text: course.description || `Confira o curso ${course.name}`,
                                url: shareUrl,
                              })
                            } catch (err) {
                              if (err.name !== 'AbortError') {
                                // Se falhar ou não suportar, copiar para clipboard
                                await navigator.clipboard.writeText(shareUrl)
                                alert('Link copiado para a área de transferência!')
                              }
                            }
                          } else {
                            // Fallback: copiar para clipboard
                            await navigator.clipboard.writeText(shareUrl)
                            alert('Link copiado para a área de transferência!')
                          }
                        }}
                        className="rounded-full bg-slate-100 hover:bg-slate-200 px-4 py-3 text-slate-700 transition-all flex items-center justify-center"
                        title="Compartilhar curso"
                      >
                        <ShareIcon className="h-5 w-5" />
                      </motion.button>
                    </motion.div>
                  </div>
                </div>
              </motion.div>
            )})}
          </div>
        </motion.div>
      )}

      {/* Hero Section */}
      <motion.div 
        className="grid gap-6 sm:gap-8 rounded-3xl bg-gradient-to-br from-alego-700 via-alego-600 to-alego-500 p-6 sm:p-8 md:p-10 text-white md:grid-cols-2 shadow-xl border border-alego-600/20"
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8, type: "spring", stiffness: 100 }}
      >
        <motion.div
          initial={{ opacity: 0, x: -80 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, type: "spring", stiffness: 80 }}
        >
          <motion.p 
            className="text-xs sm:text-sm font-semibold uppercase tracking-[0.3em] text-alego-100"
            initial={{ opacity: 0, y: -20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            Plataforma Completa
          </motion.p>
          <motion.h1 
            className="mt-3 sm:mt-4 text-2xl sm:text-3xl md:text-4xl font-black leading-tight"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            Plataforma de Estudos Completa
          </motion.h1>
          <motion.p 
            className="mt-4 sm:mt-6 text-base sm:text-lg text-alego-50"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Plataforma completa com IA, flashcards inteligentes, questões personalizadas,
            ranking em tempo real e suporte 24/7 para acelerar sua aprovação.
          </motion.p>
          <motion.div 
            className="mt-6 sm:mt-8 flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 justify-center items-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                to="/login"
                className="rounded-full bg-white px-5 sm:px-6 py-2.5 sm:py-3 text-sm font-semibold text-alego-600 shadow text-center hover:bg-alego-50 transition whitespace-nowrap"
              >
                Começar agora
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                to="/login"
                className="rounded-full border border-white/60 px-5 sm:px-6 py-2.5 sm:py-3 text-sm font-semibold text-white text-center hover:bg-white/10 transition whitespace-nowrap"
              >
                Já tenho conta
              </Link>
            </motion.div>
          </motion.div>
        </motion.div>
        <motion.div 
          className="space-y-3 sm:space-y-4 rounded-2xl bg-white/10 p-4 sm:p-6"
          initial={{ opacity: 0, x: 80 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, type: "spring", stiffness: 80 }}
        >
          {benefits.map((benefit, index) => (
            <motion.div
              key={benefit}
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ scale: 1.02, x: 5 }}
              className="flex items-start sm:items-center gap-2 sm:gap-3 rounded-2xl bg-white/20 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold cursor-default"
            >
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity, delay: index * 0.2 }}
              >
                <ShieldCheckIcon className="h-5 w-5 sm:h-6 sm:w-6 text-alego-100 flex-shrink-0 mt-0.5 sm:mt-0" />
              </motion.div>
              <span>{benefit}</span>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>

      {/* Features Grid */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.6 }}
      >
        <motion.div 
          className="text-center mb-8"
          initial={{ opacity: 0, y: -30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, type: "spring" }}
        >
          <motion.h2 
            className="text-2xl sm:text-3xl md:text-4xl font-black text-alego-700 dark:text-alego-300 mb-3"
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, type: "spring", delay: 0.1 }}
          >
            Tudo que você precisa para sua aprovação
          </motion.h2>
          <motion.p 
            className="text-slate-600 dark:text-slate-400 text-sm sm:text-base"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Plataforma completa com inteligência artificial e recursos avançados
          </motion.p>
        </motion.div>
        <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, index) => {
            const Icon = feature.icon
            const isEven = index % 2 === 0
            const direction = isEven ? -60 : 60
            return (
              <motion.div
                key={index}
                className="group relative overflow-hidden rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 shadow-lg hover:shadow-2xl border border-slate-200/50 dark:border-slate-700/50"
                initial={{ 
                  opacity: 0, 
                  y: 50,
                  x: direction,
                  rotate: isEven ? -5 : 5
                }}
                whileInView={{ 
                  opacity: 1, 
                  y: 0,
                  x: 0,
                  rotate: 0
                }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ 
                  duration: 0.7, 
                  delay: index * 0.12,
                  type: "spring",
                  stiffness: 100
                }}
                whileHover={{ scale: 1.05, y: -12, rotate: isEven ? 2 : -2 }}
              >
                <motion.div 
                  className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${feature.color} opacity-10 rounded-full blur-2xl group-hover:opacity-30 transition-all duration-500`}
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.1, 0.2, 0.1],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    delay: index * 0.3,
                  }}
                ></motion.div>
                <div className="relative z-10">
                  <motion.div 
                    className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${feature.color} mb-4 shadow-lg`}
                    initial={{ scale: 0, rotate: -180 }}
                    whileInView={{ scale: 1, rotate: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: index * 0.15, type: "spring" }}
                    whileHover={{ scale: 1.15, rotate: [0, -10, 10, -10, 0] }}
                  >
                    <Icon className="h-6 w-6 text-white" />
                  </motion.div>
                  <motion.h3 
                    className="text-lg font-bold text-alego-700 dark:text-alego-300 mb-2"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: index * 0.2 }}
                  >
                    {feature.title}
                  </motion.h3>
                  <motion.p 
                    className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed"
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: index * 0.25 }}
                  >
                    {feature.description}
                  </motion.p>
                </div>
              </motion.div>
            )
          })}
        </div>
      </motion.div>

      {/* Avaliações dos Alunos */}
      <motion.div 
        className="rounded-2xl bg-white dark:bg-slate-800 p-6 sm:p-8 shadow-sm"
        initial={{ opacity: 0, y: 60 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8, type: "spring", stiffness: 100 }}
      >
        <Reviews />
      </motion.div>

      {/* CTA Final */}
      <motion.div 
        className="rounded-2xl bg-gradient-to-r from-alego-600 to-alego-700 p-8 sm:p-10 text-center text-white relative overflow-hidden"
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8, type: "spring", stiffness: 100 }}
      >
        {/* Background animado */}
        <motion.div
          className="absolute inset-0 opacity-20"
          animate={{
            background: [
              "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.3) 0%, transparent 50%)",
              "radial-gradient(circle at 80% 80%, rgba(255,255,255,0.3) 0%, transparent 50%)",
              "radial-gradient(circle at 40% 20%, rgba(255,255,255,0.3) 0%, transparent 50%)",
              "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.3) 0%, transparent 50%)",
            ]
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "linear"
          }}
        />
        <div className="relative z-10">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            whileInView={{ scale: 1, rotate: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, type: "spring", delay: 0.2 }}
          >
            <AcademicCapIcon className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-4 text-alego-100" />
          </motion.div>
          <motion.h2 
            className="text-2xl sm:text-3xl md:text-4xl font-black mb-4"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            Pronto para começar sua jornada?
          </motion.h2>
          <motion.p 
            className="text-alego-100 mb-6 text-sm sm:text-base max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            Junte-se a centenas de alunos que já estão se preparando para seus concursos com nossa plataforma completa.
          </motion.p>
          <motion.div 
            className="flex flex-col sm:flex-row gap-4 justify-center items-center flex-wrap"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <motion.div
              whileHover={{ scale: 1.1, y: -5 }}
              whileTap={{ scale: 0.95 }}
            >
              <Link
                to="/login"
                className="inline-block rounded-full bg-white px-8 py-3 sm:px-10 sm:py-4 text-base sm:text-lg font-black text-alego-600 shadow-2xl hover:bg-alego-50 transition-all whitespace-nowrap"
              >
                Começar Agora
              </Link>
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.1, y: -5 }}
              whileTap={{ scale: 0.95 }}
            >
              <Link
                to="/pagamento"
                onClick={trackButtonClick}
                className="inline-block rounded-full bg-white px-8 py-3 sm:px-10 sm:py-4 text-base sm:text-lg font-black text-alego-600 shadow-2xl hover:bg-alego-50 transition-all whitespace-nowrap"
              >
                Garantir Promoção
              </Link>
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.1, y: -5 }}
              whileTap={{ scale: 0.95 }}
            >
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-full border-2 border-white px-8 py-3 sm:px-10 sm:py-4 text-base sm:text-lg font-black text-white hover:bg-white/10 transition-all whitespace-nowrap"
              >
                Falar no WhatsApp
              </a>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>

      {/* Seção de Notícias - No final da página */}
      <motion.div
        initial={{ opacity: 0, y: 80 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8, type: "spring", stiffness: 100 }}
      >
        <NewsSection />
      </motion.div>
    </section>
  )
}

export default PublicHome

