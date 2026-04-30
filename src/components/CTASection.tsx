'use client'

import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { useInView } from 'react-intersection-observer'

export default function CTASection() {
  const [ref, inView] = useInView({ triggerOnce: true, threshold: 0.1 })

  const containerVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
        ease: [0.6, -0.05, 0.01, 0.99]
      }
    }
  }

  const buttonVariants = {
    hidden: { scale: 0.8, opacity: 0 },
    visible: {
      scale: 1,
      opacity: 1,
      transition: {
        duration: 0.5,
        delay: 0.3
      }
    }
  }

  return (
    <section className="relative py-32 overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-r from-primary-600 via-accent-600 to-primary-600" />
        <div className="absolute inset-0 bg-gradient-to-r from-primary-600 via-accent-600 to-primary-600 animate-gradient-shift bg-[length:200%_200%]" />
        <div className="absolute inset-0 bg-black/20" />
        
        {/* Floating particles */}
        <div className="absolute top-10 left-10 w-4 h-4 bg-white/20 rounded-full animate-float" />
        <div className="absolute top-20 right-20 w-6 h-6 bg-white/10 rounded-full animate-float animation-delay-2000" />
        <div className="absolute bottom-20 left-1/4 w-3 h-3 bg-white/15 rounded-full animate-float animation-delay-4000" />
        <div className="absolute top-1/3 right-1/4 w-5 h-5 bg-white/10 rounded-full animate-float animation-delay-1000" />
      </div>
      
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div 
          ref={ref}
          variants={containerVariants}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
        >
          <motion.h2 
            variants={containerVariants}
            className="text-4xl lg:text-6xl font-bold text-white mb-8 font-display leading-tight"
          >
            Comece Sua Jornada para a{' '}
            <span className="relative">
              <span className="relative z-10">Aprovação</span>
              <motion.div 
                className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent blur-lg"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 3, repeat: Infinity }}
              />
            </span>
            <br />
            <span className="text-3xl lg:text-5xl">Hoje</span>
          </motion.h2>
          
          <motion.p 
            variants={containerVariants}
            className="text-xl lg:text-2xl text-white/90 mb-12 max-w-3xl mx-auto leading-relaxed"
          >
            Junte-se a milhares de concurseiros que já estão transformando 
            sua preparação com o FlashConCards.
          </motion.p>
          
          <motion.div 
            variants={containerVariants}
            className="flex flex-col sm:flex-row gap-6 justify-center items-center"
          >
            <motion.button
              variants={buttonVariants}
              className="group relative overflow-hidden bg-white text-primary-600 px-10 py-5 rounded-2xl font-bold text-lg transition-all duration-300 hover:scale-105 hover:shadow-2xl"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-accent-500 to-primary-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <span className="relative z-10 flex items-center">
                Começar Gratuitamente
                <ArrowRight className="ml-3 h-5 w-5 group-hover:translate-x-1 transition-transform duration-300" />
              </span>
            </motion.button>
            
            <motion.button
              variants={buttonVariants}
              className="group relative overflow-hidden border-2 border-white text-white px-10 py-5 rounded-2xl font-bold text-lg transition-all duration-300 hover:scale-105 hover:bg-white hover:text-primary-600"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <span className="relative z-10 flex items-center">
                Ver Demonstração
                <ArrowRight className="ml-3 h-5 w-5 group-hover:translate-x-1 transition-transform duration-300" />
              </span>
            </motion.button>
          </motion.div>
          
          {/* Trust indicators */}
          <motion.div 
            variants={containerVariants}
            className="mt-16 flex flex-wrap items-center justify-center gap-12 text-white/80"
          >
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
              <span className="text-sm">Sem cartão necessário</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse animation-delay-1000" />
              <span className="text-sm">Cancelamento a qualquer momento</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-purple-400 rounded-full animate-pulse animation-delay-2000" />
              <span className="text-sm">Suporte 24/7</span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
