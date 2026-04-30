'use client'

import { motion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'

export default function HowItWorksSection() {
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

  const steps = [
    {
      number: "1",
      title: "Escolha seu Concurso",
      description: "Selecione o concurso público que você está preparando e informe a banca examinadora para conteúdo personalizado.",
      gradient: "from-primary-500 to-primary-600"
    },
    {
      number: "2",
      title: "Gere Flashcards com IA",
      description: "Nossa IA analisa o edital e cria flashcards personalizados com as questões mais relevantes.",
      gradient: "from-accent-500 to-purple-600"
    },
    {
      number: "3",
      title: "Estude e Acompanhe",
      description: "Estude com os flashcards, monitore seu progresso e receba recomendações personalizadas.",
      gradient: "from-green-500 to-emerald-600"
    }
  ]

  return (
    <section id="how-it-works" className="relative py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-dark-950 to-dark-900" />
      <div className="absolute inset-0 opacity-10">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="dots" width="40" height="40" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill="rgba(255,255,255,0.1)"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)" />
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
            className="inline-flex items-center bg-gradient-to-r from-accent-500/20 to-purple-500/20 backdrop-blur-md text-accent-300 px-6 py-3 rounded-full text-sm font-medium mb-8 border border-accent-500/30"
            whileHover={{ scale: 1.05 }}
          >
            <span className="w-2 h-2 bg-accent-400 rounded-full mr-2 animate-pulse" />
            Como Funciona
          </motion.div>
          
          <motion.h2 
            variants={itemVariants}
            className="text-4xl lg:text-6xl font-bold text-white mb-6 font-display"
          >
            Comece a Estudar de Forma{' '}
            <span className="bg-gradient-to-r from-accent-400 to-purple-400 bg-clip-text text-transparent">
              Mais Eficiente
            </span>
          </motion.h2>
          
          <motion.p 
            variants={itemVariants}
            className="text-xl text-gray-300 max-w-4xl mx-auto leading-relaxed"
          >
            Comece a estudar de forma mais eficiente em apenas 3 passos simples
          </motion.p>
        </motion.div>

        <motion.div 
          ref={ref}
          variants={containerVariants}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          className="grid grid-cols-1 md:grid-cols-3 gap-8"
        >
          {steps.map((step, index) => (
            <motion.div 
              key={step.number}
              variants={itemVariants}
              className="group relative text-center"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 to-accent-500/10 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-300 opacity-0 group-hover:opacity-100" />
              <div className="relative bg-white/5 backdrop-blur-xl p-8 rounded-3xl border border-white/10 hover:bg-white/10 transition-all duration-300 hover:scale-105">
                <motion.div 
                  variants={itemVariants}
                  className={`bg-gradient-to-r ${step.gradient} w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-8 text-3xl font-bold text-white shadow-glow`}
                  whileHover={{ scale: 1.1, rotate: 5 }}
                >
                  {step.number}
                </motion.div>
                <motion.h3 
                  variants={itemVariants}
                  className="text-2xl font-bold text-white mb-6"
                >
                  {step.title}
                </motion.h3>
                <motion.p 
                  variants={itemVariants}
                  className="text-gray-300 leading-relaxed"
                >
                  {step.description}
                </motion.p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
