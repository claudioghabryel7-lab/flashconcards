import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircleIcon, XMarkIcon } from '@heroicons/react/24/solid'

// Lista de nomes brasileiros aleatórios
const names = [
  'Ana Silva', 'Carlos Santos', 'Maria Oliveira', 'João Pereira', 'Fernanda Costa',
  'Ricardo Alves', 'Juliana Lima', 'Pedro Souza', 'Camila Rodrigues', 'Lucas Ferreira',
  'Beatriz Martins', 'Rafael Gomes', 'Amanda Ribeiro', 'Bruno Carvalho', 'Larissa Araújo',
  'Thiago Barbosa', 'Gabriela Rocha', 'Felipe Dias', 'Isabela Monteiro', 'Gustavo Nunes',
  'Mariana Castro', 'Diego Moura', 'Patrícia Freitas', 'Rodrigo Teixeira', 'Vanessa Lopes'
]

// Função para gerar tempo aleatório
const getRandomTime = () => {
  const times = [
    { value: 1, unit: 'hora', plural: 'hora' },
    { value: 2, unit: 'horas', plural: 'horas' },
    { value: 3, unit: 'horas', plural: 'horas' },
    { value: 5, unit: 'horas', plural: 'horas' },
    { value: 8, unit: 'horas', plural: 'horas' },
    { value: 12, unit: 'horas', plural: 'horas' },
    { value: 1, unit: 'dia', plural: 'dia' },
    { value: 2, unit: 'dias', plural: 'dias' },
  ]
  return times[Math.floor(Math.random() * times.length)]
}

const FakeTestimonials = () => {
  const [currentTestimonial, setCurrentTestimonial] = useState(null)
  const [show, setShow] = useState(true)
  const [isActive, setIsActive] = useState(true)
  const startTimeRef = useRef(Date.now())

  const generateTestimonial = () => {
    const name = names[Math.floor(Math.random() * names.length)]
    const time = getRandomTime()
    return {
      id: Date.now(),
      name,
      time: `${time.value} ${time.plural} atrás`,
    }
  }

  useEffect(() => {
    // Gerar primeiro depoimento
    setCurrentTestimonial(generateTestimonial())
    setShow(true)
    startTimeRef.current = Date.now()
    setIsActive(true)

    // Timer para parar após 30 segundos
    const stopTimer = setTimeout(() => {
      setIsActive(false)
      setShow(false) // Fechar o pop-up atual
    }, 30000) // 30 segundos

    // Mostrar novo depoimento a cada 5 segundos (apenas enquanto estiver ativo)
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current
      if (elapsed >= 30000) {
        clearInterval(interval)
        setIsActive(false)
        setShow(false)
        return
      }

      setShow(false)
      // Aguardar animação de saída antes de mostrar novo
      setTimeout(() => {
        const elapsedCheck = Date.now() - startTimeRef.current
        if (elapsedCheck < 30000) {
          setCurrentTestimonial(generateTestimonial())
          setShow(true)
        }
      }, 300)
    }, 5000) // 5 segundos

    return () => {
      clearInterval(interval)
      clearTimeout(stopTimer)
    }
  }, [])

  const handleClose = () => {
    setShow(false)
    // Gerar novo após 5 segundos (apenas se ainda estiver nos 30 segundos)
    if (isActive) {
      setTimeout(() => {
        const elapsed = Date.now() - startTimeRef.current
        if (elapsed < 30000 && isActive) {
          setCurrentTestimonial(generateTestimonial())
          setShow(true)
        }
      }, 5000)
    }
  }

  // Não mostrar se não estiver ativo ou não tiver depoimento
  if (!currentTestimonial || !isActive) {
    return null
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, x: -100, y: 0 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, x: -100, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="fixed bottom-4 left-4 z-30 max-w-xs w-full sm:bottom-4 sm:left-4"
        >
          <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-green-200 dark:border-green-700 p-4 backdrop-blur-sm">
            {/* Botão fechar */}
            <button
              onClick={handleClose}
              className="absolute top-2 right-2 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              aria-label="Fechar"
            >
              <XMarkIcon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            </button>

            <div className="flex items-center gap-3 pr-6">
              <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {currentTestimonial.name}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  comprou há {currentTestimonial.time}
                </p>
              </div>
            </div>

            {/* Barra de progresso para indicar tempo restante */}
            <motion.div
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: 5, ease: 'linear' }}
              className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-green-500 to-emerald-500 rounded-b-xl"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default FakeTestimonials

