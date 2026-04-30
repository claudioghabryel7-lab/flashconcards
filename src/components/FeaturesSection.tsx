'use client'

import { motion } from 'framer-motion'
import { Brain, Target, TrendingUp, Zap, BookOpen, Users, CheckCircle } from 'lucide-react'
import { useInView } from 'react-intersection-observer'

export default function FeaturesSection() {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.1 })

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        delayChildren: 0.3,
        staggerChildren: 0.2
      }
    }
  }

  const itemVariants = {
    hidden: { y: 30, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.8,
        ease: [0.6, -0.05, 0.01, 0.99]
      }
    }
  }

  const features = [
    {
      icon: Brain,
      title: "Flashcards com IA",
      description: "Gere flashcards personalizados usando inteligência artificial, adaptados ao seu estilo de aprendizagem.",
      benefits: ["Conteúdo relevante e atualizado", "Adaptação automática de dificuldade"],
      gradient: "from-primary-500 to-primary-600",
      hoverGradient: "from-primary-500/20 to-accent-500/20",
      borderGradient: "hover:border-primary-500/30"
    },
    {
      icon: Target,
      title: "Estudo Focado",
      description: "Material 100% direcionado para editais específicos, eliminando conteúdo desnecessário.",
      benefits: ["Foco no edital do seu concurso", "Priorização de temas mais cobrados"],
      gradient: "from-green-500 to-emerald-600",
      hoverGradient: "from-green-500/20 to-emerald-500/20",
      borderGradient: "hover:border-green-500/30"
    },
    {
      icon: TrendingUp,
      title: "Acompanhamento Inteligente",
      description: "Monitore seu progresso em tempo real e receba recomendações personalizadas.",
      benefits: ["Análise de desempenho detalhada", "Relatórios de evolução semanais"],
      gradient: "from-accent-500 to-purple-600",
      hoverGradient: "from-accent-500/20 to-purple-500/20",
      borderGradient: "hover:border-accent-500/30"
    },
    {
      icon: Zap,
      title: "Aprendizado Acelerado",
      description: "Método de repetição espaçada comprovado cientificamente.",
      benefits: ["Repetição espaçada inteligente", "Otimização de tempo de estudo"],
      gradient: "from-orange-500 to-red-600",
      hoverGradient: "from-orange-500/20 to-red-500/20",
      borderGradient: "hover:border-orange-500/30"
    },
    {
      icon: BookOpen,
      title: "Biblioteca Completa",
      description: "Acesso a milhares de flashcards criados por especialistas.",
      benefits: ["Flashcards prontos para usar", "Conteúdo validado por especialistas"],
      gradient: "from-blue-500 to-cyan-600",
      hoverGradient: "from-blue-500/20 to-cyan-500/20",
      borderGradient: "hover:border-blue-500/30"
    },
    {
      icon: Users,
      title: "Comunidade Ativa",
      description: "Conecte-se com outros concurseiros e aprenda junto.",
      benefits: ["Fóruns de discussão por matéria", "Grupos de estudo colaborativos"],
      gradient: "from-red-500 to-pink-600",
      hoverGradient: "from-red-500/20 to-pink-500/20",
      borderGradient: "hover:border-red-500/30"
    }
  ]

  return (
    <section id="features" className="relative py-32 overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-gradient-to-b from-dark-900 to-dark-950" />
      <div className="absolute inset-0 opacity-20">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>
      
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div 
          ref={ref}
          variants={containerVariants}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          className="text-center mb-20"
        >
          <motion.div 
            variants={itemVariants}
            className="inline-flex items-center bg-gradient-to-r from-primary-500/20 to-accent-500/20 backdrop-blur-md text-primary-300 px-6 py-3 rounded-full text-sm font-medium mb-8 border border-primary-500/30"
            whileHover={{ scale: 1.05 }}
          >
            <Zap className="h-4 w-4 mr-2" />
            Recursos Avançados
          </motion.div>
          
          <motion.h2 
            variants={itemVariants}
            className="text-4xl lg:text-6xl font-bold text-white mb-6 font-display"
          >
            Recursos que{' '}
            <span className="bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent">
              Potencializam
            </span>
            <br />
            Seu Estudo
          </motion.h2>
          
          <motion.p 
            variants={itemVariants}
            className="text-xl text-gray-300 max-w-4xl mx-auto leading-relaxed"
          >
            Ferramentas inteligentes desenvolvidas para maximizar seu aprendizado 
            e acelerar sua aprovação em concursos públicos.
          </motion.p>
        </motion.div>

        <motion.div 
          ref={ref}
          variants={containerVariants}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
        >
          {features.map((feature, index) => (
            <motion.div 
              key={feature.title}
              variants={itemVariants}
              className="group relative"
            >
              <div className={`absolute inset-0 bg-gradient-to-r ${feature.hoverGradient} rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-300 opacity-0 group-hover:opacity-100`} />
              <div className={`relative bg-white/5 backdrop-blur-xl p-8 rounded-3xl border border-white/10 hover:bg-white/10 transition-all duration-300 hover:scale-105 ${feature.borderGradient}`}>
                <div className={`bg-gradient-to-r ${feature.gradient} w-16 h-16 rounded-2xl flex items-center justify-center mb-6 group-hover:animate-pulse shadow-glow`}>
                  <feature.icon className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-4">{feature.title}</h3>
                <p className="text-gray-300 mb-6 leading-relaxed">
                  {feature.description}
                </p>
                <ul className="space-y-3 text-sm text-gray-400">
                  {feature.benefits.map((benefit, benefitIndex) => (
                    <li key={benefitIndex} className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-green-400 mr-3 flex-shrink-0" />
                      {benefit}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
