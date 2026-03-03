import { useState, useEffect } from 'react'
import { doc, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { ShieldCheckIcon, XMarkIcon, UserIcon } from '@heroicons/react/24/outline'
import { ShieldCheckIcon as ShieldSolid } from '@heroicons/react/24/solid'

const LGPDConsent = () => {
  const { user, profile } = useAuth()
  const [isVisible, setIsVisible] = useState(false)
  const [phone, setPhone] = useState('')
  const [showPhoneForm, setShowPhoneForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hasConsented, setHasConsented] = useState(false)

  // Verificar se o usuário já consentiu
  useEffect(() => {
    if (!user || !profile) return

    // Se já consentiu, não mostrar o banner
    if (profile.lgpdConsent) {
      setHasConsented(true)
      return
    }

    // Mostrar banner após 2 segundos
    const timer = setTimeout(() => {
      setIsVisible(true)
    }, 2000)

    return () => clearTimeout(timer)
  }, [user, profile])

  // Aceitar termos LGPD
  const handleAccept = async (withPhone = false) => {
    if (!user) return

    setLoading(true)
    try {
      const userRef = doc(db, 'users', user.uid)
      
      if (withPhone && phone.trim()) {
        // Validar telefone básico
        const cleanPhone = phone.replace(/\D/g, '')
        if (cleanPhone.length < 10) {
          alert('Por favor, insira um número de telefone válido')
          setLoading(false)
          return
        }

        // Salvar consentimento e telefone
        await updateDoc(userRef, {
          lgpdConsent: true,
          lgpdConsentDate: new Date().toISOString(),
          phone: cleanPhone,
          phoneShared: true
        })
      } else {
        // Salvar apenas consentimento
        await updateDoc(userRef, {
          lgpdConsent: true,
          lgpdConsentDate: new Date().toISOString()
        })
      }

      setHasConsented(true)
      setIsVisible(false)
    } catch (error) {
      console.error('Erro ao salvar consentimento LGPD:', error)
      alert('Erro ao salvar consentimento. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  // Recusar (mínimo necessário)
  const handleDecline = async () => {
    if (!user) return

    setLoading(true)
    try {
      const userRef = doc(db, 'users', user.uid)
      
      // Salvar consentimento mínimo (necessário para usar o sistema)
      await updateDoc(userRef, {
        lgpdConsent: true,
        lgpdConsentDate: new Date().toISOString(),
        phoneShared: false
      })

      setHasConsented(true)
      setIsVisible(false)
    } catch (error) {
      console.error('Erro ao salvar consentimento LGPD:', error)
      alert('Erro ao salvar consentimento. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  // Fechar banner temporariamente
  const handleTemporaryClose = () => {
    setIsVisible(false)
    // Mostrar novamente após 30 segundos
    setTimeout(() => {
      if (!hasConsented) {
        setIsVisible(true)
      }
    }, 30000)
  }

  // Formatar telefone
  const formatPhone = (value) => {
    const clean = value.replace(/\D/g, '')
    const match = clean.match(/^(\d{2})(\d{5})(\d{4})$/)
    if (match) {
      return `(${match[1]}) ${match[2]}-${match[3]}`
    }
    return value
  }

  if (!isVisible || hasConsented) {
    return null
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-900 dark:bg-slate-950 text-white p-4 shadow-2xl z-50 border-t border-slate-700">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start gap-4">
          {/* Ícone */}
          <div className="flex-shrink-0">
            <ShieldSolid className="h-6 w-6 text-blue-400" />
          </div>

          {/* Conteúdo */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-white">
                Proteção de Dados (LGPD)
              </h3>
              <button
                onClick={handleTemporaryClose}
                className="text-slate-400 hover:text-white transition-colors"
                title="Fechar temporariamente"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <p className="text-slate-300 text-sm mb-4 leading-relaxed">
              Levamos sua privacidade a sério! Ao usar nosso sistema, coletamos dados essenciais para oferecer a melhor experiência de aprendizado. 
              Opcionalmente, você pode compartilhar seu telefone para receber comunicados importantes sobre o curso.
            </p>

            {!showPhoneForm ? (
              // Botões principais
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setShowPhoneForm(true)}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <UserIcon className="h-4 w-4" />
                  Aceitar e Compartilhar Telefone
                </button>
                
                <button
                  onClick={() => handleAccept(false)}
                  disabled={loading}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Aceitar Termos
                </button>
                
                <button
                  onClick={handleDecline}
                  disabled={loading}
                  className="px-4 py-2 bg-slate-600 text-white rounded-lg font-medium hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                >
                  Continuar sem Aceitar
                </button>
              </div>
            ) : (
              // Formulário de telefone
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Seu Telefone (opcional)
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    placeholder="(00) 00000-0000"
                    maxLength={15}
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Seu telefone será usado apenas para comunicados importantes sobre o curso
                  </p>
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => handleAccept(true)}
                    disabled={loading}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? (
                      <>
                        <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent mr-2"></div>
                        Salvando...
                      </>
                    ) : (
                      'Salvar e Continuar'
                    )}
                  </button>
                  
                  <button
                    onClick={() => {
                      setShowPhoneForm(false)
                      setPhone('')
                    }}
                    disabled={loading}
                    className="px-4 py-2 bg-slate-600 text-white rounded-lg font-medium hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Voltar
                  </button>
                </div>
              </div>
            )}

            {/* Link para política de privacidade */}
            <div className="mt-4 text-xs text-slate-400">
              <a 
                href="/politica-privacidade" 
                className="text-blue-400 hover:text-blue-300 underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Leia nossa Política de Privacidade
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LGPDConsent
