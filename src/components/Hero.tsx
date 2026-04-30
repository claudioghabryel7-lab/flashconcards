'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Sparkles, Target, Zap, Brain, Star, CheckCircle } from 'lucide-react'
import { useInView } from 'react-intersection-observer'

export default function Hero() {
  const [email, setEmail] = useState('')
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.1 })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Email submitted:', email)
  }

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
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.8,
        ease: [0.6, -0.05, 0.01, 0.99]
      }
    }
  }

  const floatingVariants = {
    initial: { y: 0 },
    animate: {
      y: [-10, 10, -10],
      transition: {
        duration: 6,
        repeat: Infinity,
        ease: "easeInOut"
      }
    }
  }

  return (
    <section id="home" className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0">
        <div className="absolute top-20 left-20 w-96 h-96 bg-primary-500/20 rounded-full filter blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-accent-500/20 rounded-full filter blur-3xl animate-pulse-slow animation-delay-2000" />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-r from-primary-500/10 to-accent-500/10 rounded-full filter blur-3xl animate-pulse-slow animation-delay-4000" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <motion.div 
          ref={ref}
          variants={containerVariants}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          className="grid lg:grid-cols-2 gap-16 items-center"
        >
          {/* Left Content */}
          <motion.div variants={itemVariants} className="text-center lg:text-left">
            {/* Badge */}
            <motion.div 
              variants={itemVariants}
              className="inline-flex items-center bg-white/10 backdrop-blur-md text-white px-6 py-3 rounded-full text-sm font-medium mb-8 border border-white/20"
              whileHover={{ scale: 1.05, transition: { duration: 0.2 } }}
            >
              <Sparkles className="h-4 w-4 mr-2 text-yellow-400 animate-pulse" />
              Revolucione seu aprendizado com IA
              <Star className="h-4 w-4 ml-2 text-yellow-400 animate-pulse animation-delay-1000" />
            </motion.div>
            
            {/* Main Heading */}
            <motion.h1 
              variants={itemVariants}
              className="text-5xl lg:text-7xl font-bold text-white mb-8 leading-tight font-display"
            >
              Flashcards{' '}
              <span className="relative">
                <span className="relative z-10 bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent">
                  Inteligentes
                </span>
                <motion.div 
                  className="absolute inset-0 bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent blur-lg"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </span>
              <br />
              para Concurso Público
            </motion.h1>
            
            {/* Description */}
            <motion.p 
              variants={itemVariants}
              className="text-xl lg:text-2xl text-white/80 mb-12 leading-relaxed max-w-2xl mx-auto lg:mx-0"
            >
              Crie flashcards personalizados com IA, estude de forma eficiente e 
              conquiste sua aprovação nos concursos mais competitivos.
            </motion.p>

            {/* Email Capture */}
            <motion.form 
              variants={itemVariants}
              onSubmit={handleSubmit} 
              className="flex flex-col sm:flex-row gap-4 mb-12 max-w-lg mx-auto lg:mx-0"
            >
              <motion.input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Seu melhor e-mail"
                className="flex-1 px-6 py-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-all duration-300"
                whileFocus={{ scale: 1.02 }}
                required
              />
              <motion.button
                type="submit"
                className="group relative overflow-hidden bg-gradient-to-r from-primary-500 to-accent-500 text-white px-8 py-4 rounded-2xl font-semibold transition-all duration-300 hover:scale-105"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-accent-500 to-primary-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <span className="relative z-10 flex items-center justify-center">
                  Começar Agora
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform duration-300" />
                </span>
              </motion.button>
            </motion.form>

            {/* Trust Indicators */}
            <motion.div 
              variants={itemVariants}
              className="flex flex-wrap items-center justify-center lg:justify-start gap-8 text-white/70"
            >
              <motion.div 
                className="flex items-center"
                whileHover={{ scale: 1.1 }}
              >
                <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
                <span className="font-semibold text-white">10.000+</span>
                <span className="ml-1">alunos</span>
              </motion.div>
              <motion.div 
                className="flex items-center"
                whileHover={{ scale: 1.1 }}
              >
                <Star className="h-5 w-5 text-yellow-400 mr-2 fill-current" />
                <span className="font-semibold text-white">4.9/5</span>
                <span className="ml-1">avaliação</span>
              </motion.div>
              <motion.div 
                className="flex items-center"
                whileHover={{ scale: 1.1 }}
              >
                <Target className="h-5 w-5 text-primary-400 mr-2" />
                <span className="font-semibold text-white">95%</span>
                <span className="ml-1">aprovação</span>
              </motion.div>
            </motion.div>
          </motion.div>

          {/* Right Content - Animated Features */}
          <motion.div 
            variants={containerVariants}
            className="grid grid-cols-2 gap-6"
          >
            <motion.div 
              variants={floatingVariants}
              initial="initial"
              animate="animate"
              className="bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/20 hover:bg-white/20 transition-all duration-300 group"
              whileHover={{ scale: 1.05, y: -5 }}
            >
              <div className="bg-gradient-to-r from-primary-500 to-primary-600 w-14 h-14 rounded-2xl flex items-center justify-center mb-6 group-hover:animate-pulse">
                <Brain className="h-7 w-7 text-white" />
              </div>
              <h3 className="font-bold text-white text-lg mb-3">Conteúdo Focado</h3>
              <p className="text-white/70 text-sm leading-relaxed">
                Material 100% direcionado para o seu concurso específico
              </p>
            </motion.div>

            <motion.div 
              variants={floatingVariants}
              initial="initial"
              animate="animate"
              transition={{ delay: 0.5 }}
              className="bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/20 hover:bg-white/20 transition-all duration-300 group"
              whileHover={{ scale: 1.05, y: -5 }}
            >
              <div className="bg-gradient-to-r from-green-500 to-green-600 w-14 h-14 rounded-2xl flex items-center justify-center mb-6 group-hover:animate-pulse">
                <Zap className="h-7 w-7 text-white" />
              </div>
              <h3 className="font-bold text-white text-lg mb-3">Aprendizado Rápido</h3>
              <p className="text-white/70 text-sm leading-relaxed">
                Método comprovado que acelera sua memorização
              </p>
            </motion.div>

            <motion.div 
              variants={floatingVariants}
              initial="initial"
              animate="animate"
              transition={{ delay: 1 }}
              className="bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/20 hover:bg-white/20 transition-all duration-300 group"
              whileHover={{ scale: 1.05, y: -5 }}
            >
              <div className="bg-gradient-to-r from-accent-500 to-accent-600 w-14 h-14 rounded-2xl flex items-center justify-center mb-6 group-hover:animate-pulse">
                <Sparkles className="h-7 w-7 text-white" />
              </div>
              <h3 className="font-bold text-white text-lg mb-3">IA Personalizada</h3>
              <p className="text-white/70 text-sm leading-relaxed">
                Flashcards adaptados ao seu estilo de aprendizagem
              </p>
            </motion.div>

            <motion.div 
              variants={floatingVariants}
              initial="initial"
              animate="animate"
              transition={{ delay: 1.5 }}
              className="bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/20 hover:bg-white/20 transition-all duration-300 group"
              whileHover={{ scale: 1.05, y: -5 }}
            >
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 w-14 h-14 rounded-2xl flex items-center justify-center mb-6 group-hover:animate-pulse">
                <Target className="h-7 w-7 text-white" />
              </div>
              <h3 className="font-bold text-white text-lg mb-3">Acompanhamento</h3>
              <p className="text-white/70 text-sm leading-relaxed">
                Monitore seu progresso e identifique pontos a melhorar
              </p>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>

      {/* Scroll Indicator */}
      <motion.div 
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2"
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <div className="w-6 h-10 border-2 border-white/30 rounded-full flex justify-center">
          <div className="w-1 h-3 bg-white/50 rounded-full mt-2 animate-pulse" />
        </div>
      </motion.div>
    </section>
  )
}
