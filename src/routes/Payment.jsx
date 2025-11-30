import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  CreditCardIcon,
  BanknotesIcon,
  LockClosedIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/solid'
import { useAuth } from '../hooks/useAuth'
import { doc, setDoc, getDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { FIREBASE_FUNCTIONS } from '../config/firebaseFunctions'

const Payment = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  
  // Estados
  const [email, setEmail] = useState(user?.email || '')
  const [name, setName] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('pix') // 'pix' ou 'card'
  const [installments, setInstallments] = useState(1)
  const [loading, setLoading] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState(null) // 'success', 'pending', 'error'
  const [errorMessage, setErrorMessage] = useState('')
  const [createdCredentials, setCreatedCredentials] = useState(null) // { email, password }
  const [pixCode, setPixCode] = useState('') // Código PIX para exibir
  const [currentTransactionId, setCurrentTransactionId] = useState('') // ID da transação atual
  
  // Dados do cartão
  const [cardData, setCardData] = useState({
    number: '',
    name: '',
    expiry: '',
    cvv: '',
    installments: 1
  })
  
  // Dados do produto
  const product = {
    name: 'Mentoria Policial Legislativo ALEGO',
    originalPrice: 149.99,
    price: 99.90,
    discount: 50.09
  }

  // Opções de parcelamento
  const installmentsOptions = Array.from({ length: 10 }, (_, i) => i + 1)

  // Calcular valor das parcelas
  const calculateInstallmentValue = (total, installments) => {
    if (installments === 1) return total
    // Simulação: parcelas com juros simples de 1.99% ao mês
    const interest = 0.0199
    const totalWithInterest = total * (1 + (interest * (installments - 1)))
    return totalWithInterest / installments
  }

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  }

  const formatCardNumber = (value) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '')
    const matches = v.match(/\d{4,16}/g)
    const match = matches && matches[0] || ''
    const parts = []
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4))
    }
    if (parts.length) {
      return parts.join(' ')
    } else {
      return v
    }
  }

  const formatExpiry = (value) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '')
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4)
    }
    return v
  }

  const handleCardInputChange = (field, value) => {
    let formattedValue = value
    
    if (field === 'number') {
      formattedValue = formatCardNumber(value)
    } else if (field === 'expiry') {
      formattedValue = formatExpiry(value)
    } else if (field === 'cvv') {
      formattedValue = value.replace(/\D/g, '').substring(0, 4)
    }
    
    setCardData(prev => ({
      ...prev,
      [field]: formattedValue
    }))
  }

  const validateCardData = () => {
    if (!cardData.number || cardData.number.replace(/\s/g, '').length < 13) {
      setErrorMessage('Número do cartão inválido')
      return false
    }
    if (!cardData.name || cardData.name.length < 3) {
      setErrorMessage('Nome do portador inválido')
      return false
    }
    if (!cardData.expiry || cardData.expiry.length < 5) {
      setErrorMessage('Data de validade inválida')
      return false
    }
    if (!cardData.cvv || cardData.cvv.length < 3) {
      setErrorMessage('CVV inválido')
      return false
    }
    return true
  }

  const handlePayment = async () => {
    setLoading(true)
    setErrorMessage('')
    
    try {
      if (paymentMethod === 'card' && !validateCardData()) {
        setLoading(false)
        return
      }

      // Criar transação no Firestore
      const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const transactionRef = doc(db, 'transactions', transactionId)
      
      // Validar email
      if (!email || !email.includes('@')) {
        setErrorMessage('Por favor, informe um email válido.')
        setLoading(false)
        return
      }

      const transactionData = {
        userId: user?.uid || null,
        userEmail: email.toLowerCase().trim(),
        userName: name || email.split('@')[0],
        productName: product.name,
        amount: product.price,
        originalAmount: product.originalPrice,
        discount: product.discount,
        paymentMethod,
        installments: paymentMethod === 'card' ? installments : 1,
        installmentValue: paymentMethod === 'card' ? calculateInstallmentValue(product.price, installments) : product.price,
        status: 'pending',
        createdAt: serverTimestamp(),
        transactionId,
        // Para cartão, salvar últimos 4 dígitos
        ...(paymentMethod === 'card' && {
          cardLastDigits: cardData.number.slice(-4)
        })
      }

      await setDoc(transactionRef, transactionData)

      // Processar pagamento baseado no método
      if (paymentMethod === 'pix') {
        // PIX: criar pagamento real no Mercado Pago
        try {
          const pixResponse = await fetch(FIREBASE_FUNCTIONS.createPixPayment, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              amount: product.price,
              description: product.name,
              transactionId: transactionId,
              userEmail: email.toLowerCase().trim(),
              userName: name || email.split('@')[0],
            })
          })

          if (!pixResponse.ok) {
            throw new Error('Erro ao gerar pagamento PIX')
          }

          const pixData = await pixResponse.json()

          if (pixData.success && pixData.pixCopyPaste) {
            // Atualizar transação com dados do PIX
            await setDoc(transactionRef, {
              mercadopagoPaymentId: pixData.paymentId,
              pixQrCode: pixData.pixQrCode,
              pixCopyPaste: pixData.pixCopyPaste,
              ticketUrl: pixData.ticketUrl,
              mercadopagoStatus: pixData.status,
            }, { merge: true })

            // Salvar código PIX para exibir
            setPixCode(pixData.pixCopyPaste)
            setCurrentTransactionId(transactionId)
            setPaymentStatus('pending')
            setLoading(false)
          } else {
            throw new Error('Resposta do Mercado Pago inválida')
          }
        } catch (error) {
          console.error('Erro ao criar pagamento PIX:', error)
          setErrorMessage('Erro ao gerar código PIX. Tente novamente.')
          setLoading(false)
          setPaymentStatus('error')
        }
      } else {
        // Cartão: processa pagamento
        // Em produção: integrar com Mercado Pago SDK
        await processCardPayment(transactionData)
      }
    } catch (error) {
      console.error('Erro ao processar pagamento:', error)
      setErrorMessage('Erro ao processar pagamento. Tente novamente.')
      setLoading(false)
      setPaymentStatus('error')
    }
  }

  // Gerar senha aleatória
  const generateRandomPassword = () => {
    const length = 12
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%'
    let password = ''
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length))
    }
    return password
  }

  // Criar conta automaticamente após pagamento
  const createUserAccount = async (email, name, password, transactionId) => {
    try {
      // Chamar função Firebase para criar usuário e enviar email
      const response = await fetch(FIREBASE_FUNCTIONS.createUserAndSendEmail, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          name: name || email.split('@')[0],
          password,
          transactionId
        })
      })

      if (!response.ok) {
        throw new Error('Erro ao criar conta')
      }

      return await response.json()
    } catch (error) {
      console.error('Erro ao criar conta:', error)
      // Fallback: criar conta manualmente no frontend
      return await createUserAccountFallback(email, name, password)
    }
  }

  // Fallback para criar conta no frontend (se função não estiver disponível)
  const createUserAccountFallback = async (email, name, password) => {
    const { createUserWithEmailAndPassword } = await import('firebase/auth')
    const { auth } = await import('../firebase/config')
    
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      const uid = userCredential.user.uid

      // Criar perfil no Firestore
      const userRef = doc(db, 'users', uid)
      await setDoc(userRef, {
        uid,
        email: email.toLowerCase().trim(),
        displayName: name || email.split('@')[0],
        role: 'student',
        favorites: [],
        hasActiveSubscription: true,
        subscriptionStartDate: serverTimestamp(),
        createdAt: serverTimestamp(),
      })

      return { uid, email }
    } catch (error) {
      console.error('Erro no fallback:', error)
      throw error
    }
  }

  const processCardPayment = async (transactionData) => {
    // SIMULAÇÃO: Em produção, aqui você faria a chamada real ao Mercado Pago
    
    // Simular delay de processamento
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Simular sucesso (em produção, você verifica a resposta do gateway)
    const success = Math.random() > 0.1 // 90% de sucesso
    
    if (success) {
      // Atualizar transação como paga
      const transactionRef = doc(db, 'transactions', transactionData.transactionId)
      await setDoc(transactionRef, {
        ...transactionData,
        status: 'paid',
        paidAt: serverTimestamp()
      }, { merge: true })
      
      // Criar conta automaticamente se usuário não estiver logado
      if (!user) {
        try {
          const password = generateRandomPassword()
          const accountResult = await createUserAccount(
            transactionData.userEmail, 
            transactionData.userName, 
            password,
            transactionData.transactionId
          )
          
          // Se a função Firebase falhou, usar fallback e salvar senha para enviar depois
          if (!accountResult || !accountResult.uid) {
            throw new Error('Falha ao criar conta')
          }
          
          // Atualizar transação com userId criado
          await setDoc(transactionRef, {
            userId: accountResult.uid || accountResult.userId,
          }, { merge: true })

          // Ativar acesso
          const userId = accountResult.uid || accountResult.userId
          if (userId) {
            const userRef = doc(db, 'users', userId)
            await setDoc(userRef, {
              hasActiveSubscription: true,
              subscriptionStartDate: serverTimestamp(),
              lastPaymentDate: serverTimestamp()
            }, { merge: true })
          }

          // Salvar credenciais para exibir
          setCreatedCredentials({
            email: transactionData.userEmail,
            password: password
          })
        } catch (error) {
          console.error('Erro ao criar conta:', error)
          setErrorMessage('Pagamento aprovado, mas houve erro ao criar conta. Entre em contato com o suporte.')
        }
      } else {
        // Usuário já logado - apenas ativar acesso
        const userRef = doc(db, 'users', user.uid)
        const userDoc = await getDoc(userRef)
        if (userDoc.exists()) {
          await setDoc(userRef, {
            ...userDoc.data(),
            hasActiveSubscription: true,
            subscriptionStartDate: serverTimestamp(),
            lastPaymentDate: serverTimestamp()
          }, { merge: true })
        }
      }
      
      setPaymentStatus('success')
    } else {
      setErrorMessage('Pagamento recusado. Verifique os dados do cartão.')
      setPaymentStatus('error')
    }
    
    setLoading(false)
  }

  return (
    <div className="min-h-screen py-8 sm:py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-3xl sm:text-4xl font-black mb-2 bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent">
            Finalizar Compra
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Garanta sua promoção e comece a estudar hoje mesmo
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Resumo do Pedido */}
          <div className="lg:col-span-1">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="rounded-2xl bg-gradient-to-br from-rose-500 via-pink-500 to-rose-600 p-6 text-white shadow-xl"
            >
              <div className="mb-4">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur-sm mb-3">
                  <span>🔥 PROMOÇÃO</span>
                </div>
                <h3 className="text-xl font-bold mb-2">{product.name}</h3>
                <div className="space-y-1">
                  <p className="text-sm opacity-90 line-through">
                    {formatCurrency(product.originalPrice)}
                  </p>
                  <p className="text-3xl font-black">
                    {formatCurrency(product.price)}
                  </p>
                  <p className="text-sm opacity-90">
                    Economize {formatCurrency(product.discount)}
                  </p>
                </div>
              </div>

              {/* Método de pagamento selecionado */}
              {paymentMethod === 'card' && installments > 1 && (
                <div className="mt-4 pt-4 border-t border-white/20">
                  <p className="text-xs opacity-90 mb-1">
                    {installments}x de {formatCurrency(calculateInstallmentValue(product.price, installments))}
                  </p>
                  <p className="text-xs opacity-75">
                    Total: {formatCurrency(calculateInstallmentValue(product.price, installments) * installments)}
                  </p>
                </div>
              )}
            </motion.div>
          </div>

          {/* Formulário de Pagamento */}
          <div className="lg:col-span-2">
            <AnimatePresence mode="wait">
              {paymentStatus === 'success' ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="rounded-2xl bg-white dark:bg-slate-800 p-8 shadow-xl text-center"
                >
                  <CheckCircleIcon className="h-20 w-20 text-emerald-500 mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                    Pagamento Confirmado!
                  </h2>
                  <p className="text-slate-600 dark:text-slate-400 mb-6">
                    Seu pagamento foi processado com sucesso.
                  </p>

                  {/* Mostrar credenciais se conta foi criada */}
                  {createdCredentials && (
                    <div className="mb-6 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-6 text-left">
                      <h3 className="font-bold text-blue-900 dark:text-blue-300 mb-3">
                        ✅ Sua conta foi criada! Confira suas credenciais:
                      </h3>
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Email de acesso:
                          </p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              readOnly
                              value={createdCredentials.email}
                              className="flex-1 rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-800 p-2 text-sm font-mono"
                            />
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(createdCredentials.email)
                                alert('Email copiado!')
                              }}
                              className="rounded-lg bg-blue-600 px-3 py-2 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
                            >
                              Copiar
                            </button>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Senha (também enviada por email):
                          </p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              readOnly
                              value={createdCredentials.password}
                              className="flex-1 rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-800 p-2 text-sm font-mono"
                            />
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(createdCredentials.password)
                                alert('Senha copiada!')
                              }}
                              className="rounded-lg bg-blue-600 px-3 py-2 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
                            >
                              Copiar
                            </button>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-blue-700 dark:text-blue-400 mt-4">
                        ⚠️ Guarde essas informações com segurança! Um email também foi enviado para {createdCredentials.email}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <button
                      onClick={() => navigate('/login')}
                      className="rounded-full bg-alego-600 px-8 py-3 text-white font-semibold hover:bg-alego-700 transition-colors"
                    >
                      Fazer Login Agora
                    </button>
                    {user && (
                      <button
                        onClick={() => navigate('/dashboard')}
                        className="rounded-full bg-slate-600 px-8 py-3 text-white font-semibold hover:bg-slate-700 transition-colors"
                      >
                        Ir para Dashboard
                      </button>
                    )}
                  </div>
                </motion.div>
              ) : paymentStatus === 'pending' && paymentMethod === 'pix' ? (
                <motion.div
                  key="pix-pending"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-2xl bg-white dark:bg-slate-800 p-8 shadow-xl"
                >
                  <div className="text-center mb-6">
                    <ArrowPathIcon className="h-16 w-16 text-blue-500 mx-auto mb-4 animate-spin" />
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                      Aguardando Pagamento PIX
                    </h2>
                    <p className="text-slate-600 dark:text-slate-400">
                      Escaneie o QR Code ou copie o código para pagar
                    </p>
                  </div>
                  
                  {/* QR Code PIX */}
                  <div className="bg-white p-4 rounded-xl border-2 border-slate-300 mb-4 flex items-center justify-center">
                    <div className="text-center">
                      {pixCode ? (
                        <>
                          <p className="text-xs text-slate-500 mb-2">QR Code PIX</p>
                          <div className="w-48 h-48 bg-slate-100 rounded-lg mx-auto flex items-center justify-center">
                            <img 
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixCode)}`}
                              alt="QR Code PIX"
                              className="w-full h-full rounded-lg"
                              onError={(e) => {
                                e.target.style.display = 'none'
                                e.target.nextSibling.style.display = 'block'
                              }}
                            />
                            <div style={{display: 'none'}} className="text-xs text-slate-500 p-4">
                              QR Code não disponível. Use o código abaixo.
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-slate-500 mb-2">Gerando QR Code...</p>
                          <div className="w-48 h-48 bg-slate-100 rounded-lg mx-auto flex items-center justify-center">
                            <ArrowPathIcon className="h-8 w-8 text-slate-400 animate-spin" />
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Código PIX Copia e Cola */}
                  <div className="mb-6">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                      Código PIX (Copia e Cola)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={pixCode || 'Gerando código...'}
                        className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 p-3 text-xs font-mono"
                      />
                      <button
                        onClick={() => {
                          if (pixCode) {
                            navigator.clipboard.writeText(pixCode)
                            alert('Código copiado!')
                          }
                        }}
                        disabled={!pixCode}
                        className="rounded-lg bg-blue-600 px-4 py-3 text-white font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Copiar
                      </button>
                    </div>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                    <p className="text-sm text-blue-800 dark:text-blue-300">
                      <ExclamationTriangleIcon className="h-5 w-5 inline mr-2" />
                      Após o pagamento, você receberá um email de confirmação e seu acesso será ativado automaticamente.
                    </p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="form"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="rounded-2xl bg-white dark:bg-slate-800 p-6 sm:p-8 shadow-xl"
                >
                  {/* Dados do Cliente */}
                  {!user && (
                    <div className="mb-6 space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                          Email *
                        </label>
                        <input
                          type="email"
                          placeholder="seu@email.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                          required
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          Você receberá um email com suas credenciais de acesso após o pagamento
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                          Nome Completo *
                        </label>
                        <input
                          type="text"
                          placeholder="Seu nome completo"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                          required
                        />
                      </div>
                    </div>
                  )}

                  {/* Seleção de Método de Pagamento */}
                  <div className="mb-6">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                      Método de Pagamento
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('pix')}
                        className={`rounded-xl p-4 border-2 transition-all ${
                          paymentMethod === 'pix'
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <BanknotesIcon className={`h-8 w-8 mx-auto mb-2 ${
                          paymentMethod === 'pix' ? 'text-blue-500' : 'text-slate-400'
                        }`} />
                        <p className={`font-semibold text-sm ${
                          paymentMethod === 'pix' ? 'text-blue-700 dark:text-blue-300' : 'text-slate-600 dark:text-slate-400'
                        }`}>
                          PIX
                        </p>
                        <p className="text-xs text-slate-500 mt-1">Aprovação instantânea</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentMethod('card')}
                        className={`rounded-xl p-4 border-2 transition-all ${
                          paymentMethod === 'card'
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <CreditCardIcon className={`h-8 w-8 mx-auto mb-2 ${
                          paymentMethod === 'card' ? 'text-blue-500' : 'text-slate-400'
                        }`} />
                        <p className={`font-semibold text-sm ${
                          paymentMethod === 'card' ? 'text-blue-700 dark:text-blue-300' : 'text-slate-600 dark:text-slate-400'
                        }`}>
                          Cartão
                        </p>
                        <p className="text-xs text-slate-500 mt-1">Até 10x sem juros</p>
                      </button>
                    </div>
                  </div>

                  {/* Formulário do Cartão */}
                  {paymentMethod === 'card' && (
                    <div className="space-y-4 mb-6">
                      {/* Número do Cartão */}
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                          Número do Cartão
                        </label>
                        <input
                          type="text"
                          placeholder="0000 0000 0000 0000"
                          value={cardData.number}
                          onChange={(e) => handleCardInputChange('number', e.target.value)}
                          maxLength={19}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                        />
                      </div>

                      {/* Nome do Portador */}
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                          Nome no Cartão
                        </label>
                        <input
                          type="text"
                          placeholder="Nome como está no cartão"
                          value={cardData.name}
                          onChange={(e) => handleCardInputChange('name', e.target.value.toUpperCase())}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                        />
                      </div>

                      {/* Validade e CVV */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                            Validade
                          </label>
                          <input
                            type="text"
                            placeholder="MM/AA"
                            value={cardData.expiry}
                            onChange={(e) => handleCardInputChange('expiry', e.target.value)}
                            maxLength={5}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                            CVV
                          </label>
                          <input
                            type="text"
                            placeholder="123"
                            value={cardData.cvv}
                            onChange={(e) => handleCardInputChange('cvv', e.target.value)}
                            maxLength={4}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                          />
                        </div>
                      </div>

                      {/* Parcelas */}
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                          Parcelas
                        </label>
                        <select
                          value={installments}
                          onChange={(e) => setInstallments(parseInt(e.target.value))}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                        >
                          {installmentsOptions.map((num) => (
                            <option key={num} value={num}>
                              {num}x de {formatCurrency(calculateInstallmentValue(product.price, num))}
                              {num > 1 && ` - Total: ${formatCurrency(calculateInstallmentValue(product.price, num) * num)}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Mensagem de Erro */}
                  {errorMessage && (
                    <div className="mb-6 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 p-4">
                      <p className="text-sm text-rose-800 dark:text-rose-300 flex items-center gap-2">
                        <XCircleIcon className="h-5 w-5" />
                        {errorMessage}
                      </p>
                    </div>
                  )}

                  {/* Botão de Pagamento */}
                  <button
                    onClick={handlePayment}
                    disabled={loading}
                    className="w-full rounded-full bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-4 text-white font-bold text-lg shadow-xl hover:shadow-2xl transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <ArrowPathIcon className="h-5 w-5 animate-spin" />
                        Processando...
                      </>
                    ) : (
                      <>
                        <LockClosedIcon className="h-5 w-5" />
                        {paymentMethod === 'pix'
                          ? `Pagar ${formatCurrency(product.price)} com PIX`
                          : `Pagar ${installments}x de ${formatCurrency(calculateInstallmentValue(product.price, installments))}`}
                      </>
                    )}
                  </button>

                  {/* Segurança */}
                  <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <LockClosedIcon className="h-4 w-4" />
                    <span>Pagamento seguro e criptografado</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Payment

