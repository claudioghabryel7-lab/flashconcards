'use client'

import { motion } from 'framer-motion'
import { Star } from 'lucide-react'
import { useInView } from 'react-intersection-observer'

export default function TestimonialsSection() {
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

  const testimonials = [
    {
      name: "João Silva",
      role: "Aprovado - Auditor Fiscal",
      content: "O FlashConCards revolucionou meu estudo. Os flashcards com IA me ajudaram a focar no que realmente importa e fui aprovado!",
      avatar: "primary"
    },
    {
      name: "Maria Santos",
      role: "Aprovada - Analista Judiciário",
      content: "A economia de tempo é incrível! Estudo muito mais focado e o acompanhamento do progresso me mantém motivado.",
      avatar: "green"
    },
    {
      name: "Pedro Costa",
      role: "Aprovado - Procurador",
      content: "A qualidade dos flashcards é excepcional. Conteúdo atualizado e alinhado com as bancas examinadoras. Recomendo muito!",
      avatar: "purple"
    }
  ]

  const avatarColors = {
    primary: "bg-primary-100",
    green: "bg-green-100",
    purple: "bg-purple-100"
  }

  return (
    <section id="testimonials" className="relative py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-dark-900 to-dark-950" />
      <div className="absolute inset-0 opacity-20">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid-testimonials" width="80" height="80" patternUnits="userSpaceOnUse">
              <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid-testimonials)" />
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
            className="inline-flex items-center bg-gradient-to-r from-yellow-500/20 to-orange-500/20 backdrop-blur-md text-yellow-300 px-6 py-3 rounded-full text-sm font-medium mb-8 border border-yellow-500/30"
            whileHover={{ scale: 1.05 }}
          >
            <Star className="h-4 w-4 mr-2 fill-current" />
            Depoimentos de Alunos
          </motion.div>
          
          <motion.h2 
            variants={itemVariants}
            className="text-4xl lg:text-6xl font-bold text-white mb-6 font-display"
          >
            Alunos{' '}
            <span className="bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
              Aprovados
            </span>
          </motion.h2>
          
          <motion.p 
            variants={itemVariants}
            className="text-xl text-gray-300 max-w-4xl mx-auto leading-relaxed"
          >
            Veja como o FlashConCards transformou a preparação de milhares de concurseiros
          </motion.p>
        </motion.div>

        <motion.div 
          ref={ref}
          variants={containerVariants}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          className="grid grid-cols-1 md:grid-cols-3 gap-8"
        >
          {testimonials.map((testimonial, index) => (
            <motion.div 
              key={testimonial.name}
              variants={itemVariants}
              className="group relative"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary-500/20 to-accent-500/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-300 opacity-0 group-hover:opacity-100" />
              <div className="relative bg-white/5 backdrop-blur-xl p-8 rounded-3xl border border-white/10 hover:bg-white/10 transition-all duration-300 hover:scale-105">
                {/* Stars */}
                <motion.div 
                  variants={itemVariants}
                  className="flex items-center mb-6"
                >
                  {[...Array(5)].map((_, i) => (
                    <Star 
                      key={i} 
                      className="h-5 w-5 text-yellow-400 fill-current" 
                      style={{ animationDelay: `${i * 100}ms` }}
                    />
                  ))}
                </motion.div>
                
                {/* Content */}
                <motion.p 
                  variants={itemVariants}
                  className="text-gray-300 mb-8 leading-relaxed text-lg italic"
                >
                  "{testimonial.content}"
                </motion.p>
                
                {/* Author */}
                <motion.div 
                  variants={itemVariants}
                  className="flex items-center"
                >
                  <div className={`w-16 h-16 ${avatarColors[testimonial.avatar as keyof typeof avatarColors]} rounded-full mr-4 flex items-center justify-center`}>
                    <span className="text-2xl font-bold text-gray-600">
                      {testimonial.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="font-bold text-white text-lg">{testimonial.name}</p>
                    <p className="text-sm text-gray-400">{testimonial.role}</p>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
