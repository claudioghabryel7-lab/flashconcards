import { useState } from 'react'
import { UserIcon, EnvelopeIcon, PhoneIcon } from '@heroicons/react/24/outline'

const LeadCapture = ({ onSubmit, courseName }) => {
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    telefone: ''
  })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const validateEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

  const validatePhone = (phone) => {
    // Remove caracteres não numéricos
    const numbers = phone.replace(/\D/g, '')
    return numbers.length >= 10 && numbers.length <= 11
  }

  const formatPhone = (value) => {
    // Remove tudo que não é número
    const numbers = value.replace(/\D/g, '')
    
    // Limita a 11 dígitos
    const limited = numbers.slice(0, 11)
    
    // Formata: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
    if (limited.length <= 10) {
      return limited.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').trim()
    } else {
      return limited.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').trim()
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    
    if (name === 'telefone') {
      setFormData(prev => ({
        ...prev,
        [name]: formatPhone(value)
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }))
    }
    
    // Limpar erro do campo ao digitar
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    
    const newErrors = {}
    
    // Validações
    if (!formData.nome.trim()) {
      newErrors.nome = 'Nome é obrigatório'
    }
    
    if (!formData.email.trim()) {
      newErrors.email = 'Email é obrigatório'
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Email inválido'
    }
    
    if (!formData.telefone.trim()) {
      newErrors.telefone = 'Telefone é obrigatório'
    } else if (!validatePhone(formData.telefone)) {
      newErrors.telefone = 'Telefone inválido (mínimo 10 dígitos)'
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      setSubmitting(false)
      return
    }
    
    // Chamar callback com dados
    await onSubmit(formData)
    setSubmitting(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-8">
        <div className="text-center mb-6">
          <div className="inline-block mb-4 text-5xl">📝</div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
            Antes de começar
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Preencha seus dados para acessar o simulado
            {courseName && (
              <span className="block mt-1 font-semibold text-alego-600 dark:text-alego-400">
                {courseName}
              </span>
            )}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nome */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Nome completo *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <UserIcon className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="text"
                name="nome"
                value={formData.nome}
                onChange={handleChange}
                className={`w-full pl-10 pr-4 py-3 rounded-xl border-2 ${
                  errors.nome
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-slate-300 dark:border-slate-600 focus:border-alego-500'
                } bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none transition-colors`}
                placeholder="Seu nome completo"
                disabled={submitting}
              />
            </div>
            {errors.nome && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.nome}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Email *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <EnvelopeIcon className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className={`w-full pl-10 pr-4 py-3 rounded-xl border-2 ${
                  errors.email
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-slate-300 dark:border-slate-600 focus:border-alego-500'
                } bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none transition-colors`}
                placeholder="seu@email.com"
                disabled={submitting}
              />
            </div>
            {errors.email && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.email}</p>
            )}
          </div>

          {/* Telefone */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Telefone/WhatsApp *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <PhoneIcon className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="tel"
                name="telefone"
                value={formData.telefone}
                onChange={handleChange}
                className={`w-full pl-10 pr-4 py-3 rounded-xl border-2 ${
                  errors.telefone
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-slate-300 dark:border-slate-600 focus:border-alego-500'
                } bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none transition-colors`}
                placeholder="(62) 99999-9999"
                disabled={submitting}
              />
            </div>
            {errors.telefone && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.telefone}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gradient-to-r from-alego-600 to-alego-700 text-white py-3 rounded-xl font-bold hover:from-alego-700 hover:to-alego-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                Processando...
              </span>
            ) : (
              'Iniciar Simulado'
            )}
          </button>
        </form>

        <p className="mt-4 text-xs text-center text-slate-500 dark:text-slate-400">
          Seus dados estão seguros e serão usados apenas para contato sobre o simulado.
        </p>
      </div>
    </div>
  )
}

export default LeadCapture

