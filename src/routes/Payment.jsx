import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  CreditCardIcon,
  BanknotesIcon,
  LockClosedIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/solid'
import { useAuth } from '../hooks/useAuth'
import { doc, setDoc, getDoc, collection, serverTimestamp, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { FIREBASE_FUNCTIONS } from '../config/firebaseFunctions'
import { trackGoogleAdsConversion } from '../utils/googleAds'
import { getCourseAccessLabel } from '../utils/courseAccess'

const PAYMENT_BRANDS = [
  { src: '/pay-mercadopago.png', alt: 'Mercado Pago' },
  { src: '/pay-visa.png', alt: 'Visa' },
  { src: '/pay-mastercard.png', alt: 'Mastercard' },
  { src: '/pay-elo.png', alt: 'Elo' },
]

const COURSE_FEATURES = [
  {
    title: 'Edital verticalizado',
    desc: 'Checklist completo por disciplina e tópico',
    tone: 'from-cyan-500/20 to-blue-500/5',
  },
  {
    title: 'Flashcards com IA',
    desc: 'Repetição espaçada no padrão da banca',
    tone: 'from-emerald-500/20 to-teal-500/5',
  },
  {
    title: 'Questões preditivas',
    desc: 'Treino no estilo real da prova',
    tone: 'from-orange-500/20 to-amber-500/5',
  },
  {
    title: 'Guia Mentorado',
    desc: 'Cronograma e revisão guiada',
    tone: 'from-violet-500/20 to-purple-500/5',
  },
  {
    title: 'Véspera de Prova',
    desc: 'Revisão final antes do dia D',
    tone: 'from-pink-500/20 to-rose-500/5',
  },
  {
    title: 'Simulados',
    desc: 'Métricas e desempenho em tempo real',
    tone: 'from-lime-500/20 to-green-500/5',
  },
  {
    title: 'Professor IA',
    desc: 'Dúvidas e correções assistidas',
    tone: 'from-sky-500/20 to-cyan-500/5',
  },
  {
    title: 'Trilha de estudo',
    desc: 'Ciclo, metas e foco por matéria',
    tone: 'from-fuchsia-500/20 to-pink-500/5',
  },
]

const Payment = () => {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  
  // Estados
  const [email, setEmail] = useState(user?.email || profile?.email || '')
  const [name, setName] = useState(user?.displayName || profile?.displayName || '')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('boleto') // 'boleto' | 'card'
  const [installments, setInstallments] = useState(1)
  const [loading, setLoading] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState(null) // 'success', 'pending', 'error'
  const [errorMessage, setErrorMessage] = useState('')
  const [createdCredentials, setCreatedCredentials] = useState(null) // { email, password }
  const [currentTransactionId, setCurrentTransactionId] = useState('') // ID da transação atual
  const [selectedCourse, setSelectedCourse] = useState(null) // Curso selecionado
  
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [reviewSending, setReviewSending] = useState(false)
  const [reviewDone, setReviewDone] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [autoRenew, setAutoRenew] = useState(false)
  
  // Dados do cartão (legado — checkout cartão vai para Mercado Pago)
  const [cardData, setCardData] = useState({
    number: '',
    name: '',
    expiry: '',
    cvv: '',
    installments: 1
  })
  
  // Prefill conta quando o auth carregar
  useEffect(() => {
    if (user?.email) setEmail((prev) => prev || user.email)
    const display = user?.displayName || profile?.displayName
    if (display) setName((prev) => prev || display)
  }, [user?.email, user?.displayName, profile?.displayName])

  // Carregar curso se houver courseId na URL
  useEffect(() => {
    const courseId = searchParams.get('course')
    if (courseId) {
      const loadCourse = async () => {
        try {
          const courseRef = doc(db, 'courses', courseId)
          const courseDoc = await getDoc(courseRef)
          if (courseDoc.exists()) {
            setSelectedCourse({
              id: courseDoc.id,
              ...courseDoc.data()
            })
          }
        } catch (error) {
          console.error('Erro ao carregar curso:', error)
        }
      }
      loadCourse()
    }
  }, [searchParams])

  // Retorno do Checkout Pro (cartão / Mercado Pago)
  useEffect(() => {
    const status = searchParams.get('status')
    const txn = searchParams.get('txn')
    if (!status || !txn) return

    setCurrentTransactionId(txn)

    if (status === 'failure') {
      setPaymentStatus('error')
      setErrorMessage('Pagamento não concluído. Você pode tentar novamente.')
      setLoading(false)
      return
    }

    if (status === 'pending') {
      setPaymentMethod('card')
      setPaymentStatus('pending')
      setLoading(false)
      return
    }

    if (status === 'success') {
      setPaymentStatus('pending')
      setLoading(true)
      const transactionRef = doc(db, 'transactions', txn)
      const unsubscribe = onSnapshot(transactionRef, async (snapshot) => {
        if (!snapshot.exists()) return
        const data = snapshot.data()
        if (data.status === 'paid') {
          setPaymentStatus('success')
          setLoading(false)
          trackGoogleAdsConversion(null, data.amount || 99.9, txn)
          if (data.userEmail) {
            setCreatedCredentials({
              email: data.userEmail,
              password: 'Senha enviada por email',
            })
          }
          unsubscribe()
        } else if (data.status === 'cancelled') {
          setPaymentStatus('error')
          setErrorMessage('Pagamento cancelado.')
          setLoading(false)
          unsubscribe()
        }
      })

      // Se o webhook atrasar, mostrar sucesso otimista após retorno approved
      const timer = setTimeout(() => {
        setPaymentStatus((prev) => (prev === 'pending' ? 'success' : prev))
        setLoading(false)
      }, 8000)

      return () => {
        unsubscribe()
        clearTimeout(timer)
      }
    }
  }, [searchParams])
  
  // Dados do produto (usa curso selecionado ou padrão ALEGO)
  const product = selectedCourse ? {
    name: selectedCourse.name,
    originalPrice: selectedCourse.originalPrice || 149.99,
    price: selectedCourse.price || 99.90,
    discount: (selectedCourse.originalPrice || 149.99) - (selectedCourse.price || 99.90),
    courseId: selectedCourse.id,
    competition: selectedCourse.competition
  } : {
    name: 'Plano Premium ConCursos2.5',
    originalPrice: 149.99,
    price: 99.90,
    discount: 50.09,
    courseId: null,
    competition: 'ALEGO'
  }

  // Opções de parcelamento
  const installmentsOptions = Array.from({ length: 10 }, (_, i) => i + 1)

  // Monitorar status da transação quando estiver pendente
  useEffect(() => {
    if (!currentTransactionId || paymentStatus !== 'pending') {
      return
    }

    console.log('Monitorando transação:', currentTransactionId)
    const transactionRef = doc(db, 'transactions', currentTransactionId)
    
    // Criar listener para mudanças na transação
    const unsubscribe = onSnapshot(
      transactionRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          return
        }

        const transactionData = snapshot.data()
        const status = transactionData.status

        console.log('Status da transação atualizado:', status)

        // Se o pagamento foi confirmado
        if (status === 'paid') {
          console.log('Pagamento confirmado! Atualizando página...')
          
          // Atualizar acesso ao curso no perfil do usuário
          const userId = transactionData.userId
          if (userId && transactionData.courseId) {
            try {
              const userRef = doc(db, 'users', userId)
              const userDoc = await getDoc(userRef)
              
              if (userDoc.exists()) {
                const currentData = userDoc.data()
                const purchasedCourses = currentData.purchasedCourses || []
                
                // Adicionar curso comprado se não estiver na lista
                if (!purchasedCourses.includes(transactionData.courseId)) {
                  purchasedCourses.push(transactionData.courseId)
                  await setDoc(userRef, {
                    purchasedCourses: purchasedCourses
                  }, { merge: true })
                }
              }
            } catch (error) {
              console.error('Erro ao atualizar acesso ao curso:', error)
            }
          }
          
          // Buscar credenciais do usuário criado
          if (userId) {
            // Buscar usuário para pegar email
            const userRef = doc(db, 'users', userId)
            const userDoc = await getDoc(userRef)
            
            if (userDoc.exists()) {
              const userData = userDoc.data()
              // Mostrar que foi criado (senha só vem no email)
              setCreatedCredentials({
                email: userData.email || transactionData.userEmail,
                password: 'Senha enviada por email' // Não temos a senha aqui, ela foi enviada por email
              })
            } else {
              setCreatedCredentials({
                email: transactionData.userEmail,
                password: 'Senha enviada por email'
              })
            }
          } else {
            // Se não tem userId, mostrar apenas email
            setCreatedCredentials({
              email: transactionData.userEmail,
              password: 'Senha enviada por email'
            })
          }
          
          // Atualizar status para success
          setPaymentStatus('success')
          setLoading(false)
          
          // Rastrear conversão no Google Ads
          trackGoogleAdsConversion(null, transactionData.amount || product.price, currentTransactionId)
          
          // Parar de monitorar
          unsubscribe()
        } else if (status === 'cancelled') {
          setErrorMessage('Pagamento cancelado. Tente novamente.')
          setPaymentStatus('error')
          setLoading(false)
          unsubscribe()
        }
      },
      (error) => {
        console.error('Erro ao monitorar transação:', error)
        // Não parar o monitoramento por erros de permissão
      }
    )

    // Cleanup: parar de monitorar quando componente desmontar ou transação mudar
    return () => {
      unsubscribe()
    }
  }, [currentTransactionId, paymentStatus])

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
      if (!acceptedTerms) {
        setErrorMessage('Aceite os termos de acesso e compra para continuar.')
        setLoading(false)
        return
      }

      const emailTrim = (email || '').toLowerCase().trim()
      if (!emailTrim || !emailTrim.includes('@')) {
        setErrorMessage('Por favor, informe um email válido.')
        setLoading(false)
        return
      }

      const nameTrim = (name || '').trim()
      if (!nameTrim || nameTrim.length < 2) {
        setErrorMessage('Informe seu nome completo.')
        setLoading(false)
        return
      }

      let activeUserId = user?.uid || null
      if (!user) {
        if (!password || password.length < 6) {
          setErrorMessage('Crie uma senha com pelo menos 6 caracteres.')
          setLoading(false)
          return
        }
        if (password !== passwordConfirm) {
          setErrorMessage('As senhas não coincidem.')
          setLoading(false)
          return
        }
        try {
          const accountResult = await createUserAccount(emailTrim, nameTrim, password, null)
          activeUserId = accountResult?.uid || accountResult?.userId || null
          if (!activeUserId) throw new Error('Não foi possível criar a conta.')
          setCreatedCredentials({ email: emailTrim, password })
        } catch (accountErr) {
          console.error('Erro ao criar conta:', accountErr)
          setErrorMessage(
            accountErr?.code === 'auth/email-already-in-use' ||
              String(accountErr?.message || '').includes('email-already-in-use')
              ? 'Este email já possui conta. Faça login e tente novamente.'
              : accountErr?.message || 'Erro ao criar conta. Tente outro email ou faça login.',
          )
          setLoading(false)
          return
        }
      }

      // Criar transação no Firestore
      const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const transactionRef = doc(db, 'transactions', transactionId)

      const accessInfo = getCourseAccessLabel(selectedCourse)

      const transactionData = {
        userId: activeUserId,
        userEmail: emailTrim,
        userName: nameTrim,
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
        courseId: product.courseId,
        competition: product.competition,
        courseDuration: selectedCourse?.courseDuration || null,
        courseDurationUnit: selectedCourse?.courseDurationUnit || null,
        courseDurationValue: selectedCourse?.courseDurationValue ?? null,
        accessLabel: accessInfo.short,
        autoRenew: paymentMethod === 'card' && accessInfo.canAutoRenew && autoRenew,
        termsAcceptedAt: serverTimestamp(),
      }

      await setDoc(transactionRef, transactionData)
      setCurrentTransactionId(transactionId)

      await processMercadoPagoCheckout(transactionData, paymentMethod === 'boleto' ? 'boleto' : 'card')
    } catch (error) {
      console.error('Erro ao processar pagamento:', error)
      setErrorMessage(error.message || 'Erro ao processar pagamento. Tente novamente.')
      setLoading(false)
      setPaymentStatus('error')
    }
  }

  const submitPurchaseReview = async () => {
    if (reviewSending || reviewDone) return
    setReviewSending(true)
    try {
      const reviewId = `${currentTransactionId || Date.now()}-${user?.uid || 'guest'}`
      await setDoc(doc(db, 'purchaseReviews', reviewId), {
        transactionId: currentTransactionId || null,
        courseId: product.courseId || null,
        courseName: product.name || null,
        userId: user?.uid || null,
        userEmail: email || user?.email || null,
        rating: reviewRating,
        comment: reviewComment.trim(),
        createdAt: serverTimestamp(),
      })
      setReviewDone(true)
      setReviewOpen(false)
    } catch (err) {
      console.error('Erro ao enviar avaliação:', err)
      setErrorMessage('Não foi possível enviar a avaliação. Tente de novo.')
    } finally {
      setReviewSending(false)
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
        const errBody = await response.json().catch(() => ({}))
        throw Object.assign(new Error(errBody.message || 'Erro ao criar conta'), {
          code: errBody.code,
        })
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

  const processMercadoPagoCheckout = async (transactionData, checkoutKind = 'card') => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const courseQuery = product.courseId ? `&course=${encodeURIComponent(product.courseId)}` : ''
    const txn = encodeURIComponent(transactionData.transactionId)

    const preferenceResponse = await fetch(FIREBASE_FUNCTIONS.createCheckoutPreference, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: product.price,
        description: product.name,
        transactionId: transactionData.transactionId,
        userEmail: transactionData.userEmail,
        userName: transactionData.userName,
        courseId: product.courseId,
        courseDuration: selectedCourse?.courseDuration || null,
        courseDurationUnit: selectedCourse?.courseDurationUnit || null,
        courseDurationValue: selectedCourse?.courseDurationValue ?? null,
        checkoutKind,
        autoRenew: checkoutKind === 'card' && Boolean(transactionData.autoRenew),
        successUrl: `${origin}/pagamento?status=success&txn=${txn}${courseQuery}`,
        failureUrl: `${origin}/pagamento?status=failure&txn=${txn}${courseQuery}`,
        pendingUrl: `${origin}/pagamento?status=pending&txn=${txn}${courseQuery}`,
      }),
    })

    const preferenceData = await preferenceResponse.json().catch(() => ({}))
    if (!preferenceResponse.ok || !preferenceData.checkoutUrl) {
      throw new Error(
        preferenceData.message ||
          preferenceData.error ||
          'Não foi possível abrir o checkout do Mercado Pago.',
      )
    }

    await setDoc(doc(db, 'transactions', transactionData.transactionId), {
      mercadopagoPreferenceId: preferenceData.preferenceId || null,
      mercadopagoPreapprovalId: preferenceData.preapprovalId || null,
      mercadopagoCheckoutUrl: preferenceData.checkoutUrl,
      mercadopagoCheckoutMode: preferenceData.mode || 'checkout',
      mercadopagoCheckoutKind: checkoutKind,
      mercadopagoTestMode: preferenceData.testMode === true,
      autoRenew: checkoutKind === 'card' && Boolean(transactionData.autoRenew),
    }, { merge: true })

    window.location.href = preferenceData.checkoutUrl
  }

  const inputClass =
    'w-full rounded-xl border border-cp-border bg-[var(--cp-bg)]/60 px-4 py-3 text-sm text-cp-text outline-none transition placeholder:text-cp-muted focus:border-cp-accent/50 focus:ring-2 focus:ring-cp-accent/20'
  const labelClass = 'mb-2 block text-sm font-semibold text-cp-text'
  const courseImage = selectedCourse?.imageBase64 || selectedCourse?.imageUrl || ''
  const hasDiscount = product.discount > 0 && product.originalPrice > product.price
  const accessInfo = getCourseAccessLabel(selectedCourse)

  return (
    <div className="relative w-full overflow-hidden text-cp-text">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(34,211,238,0.16), transparent), radial-gradient(ellipse 50% 40% at 0% 80%, rgba(251,146,60,0.1), transparent)',
        }}
      />

      <div className="relative z-10 w-full py-8 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <div className="max-w-2xl">
            <span className="cp-badge cp-badge-accent mb-3 inline-flex">Checkout seguro</span>
            <h1 className="cp-headline text-3xl sm:text-4xl">Finalizar compra</h1>
            <p className="mt-2 text-sm text-cp-muted sm:text-base">
              Pagamento único. Acesso liberado assim que a confirmação chegar.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">
            {PAYMENT_BRANDS.map((brand) => (
              <img
                key={brand.src}
                src={brand.src}
                alt={brand.alt}
                className="h-9 w-auto object-contain sm:h-11"
              />
            ))}
          </div>
        </motion.div>

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          <motion.aside
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-full shrink-0 overflow-hidden rounded-3xl border border-cp-border bg-cp-surface/70 shadow-[0_0_50px_-24px_rgba(34,211,238,0.4)] backdrop-blur-sm lg:w-[420px]"
          >
            {courseImage ? (
              <div className="relative h-44 w-full overflow-hidden sm:h-52">
                <img src={courseImage} alt={product.name} className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--cp-bg)] via-transparent to-transparent" />
              </div>
            ) : null}

            <div className="space-y-4 p-5 sm:p-6">
              {product.competition ? (
                <span className="cp-badge cp-badge-cyan inline-flex">{product.competition}</span>
              ) : (
                <span className="cp-badge cp-badge-accent inline-flex">Oferta ativa</span>
              )}

              <div>
                <h2 className="text-xl font-bold text-cp-text">{product.name}</h2>
                {selectedCourse?.description ? (
                  <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-cp-muted">
                    {selectedCourse.description}
                  </p>
                ) : null}
              </div>

              <div className="rounded-2xl border border-cp-accent/20 bg-cp-accent/5 p-4">
                {hasDiscount ? (
                  <p className="text-sm text-cp-muted line-through">
                    {formatCurrency(product.originalPrice)}
                  </p>
                ) : null}
                <p className="text-3xl font-black tracking-tight text-cp-accent">
                  {formatCurrency(product.price)}
                </p>
                <p className="mt-2 text-sm font-semibold text-cp-text">
                  Tempo de acesso: {accessInfo.short}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-cp-muted">{accessInfo.summary}</p>
                {!accessInfo.isLifetime ? (
                  <p className="mt-2 text-xs text-cp-accent">
                    Expira automaticamente ao fim do período. No cartão, você pode ativar renovação
                    automática.
                  </p>
                ) : null}
              </div>

              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
                <h3 className="text-sm font-bold text-emerald-300">Garantia de 7 dias</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-cp-muted">
                  Se você não ficar satisfeito, solicite o reembolso integral em até 7 dias após a
                  compra. Sem burocracia.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-cp-border pt-4 sm:gap-3">
                {PAYMENT_BRANDS.map((brand) => (
                  <img
                    key={brand.src}
                    src={brand.src}
                    alt={brand.alt}
                    className="h-8 w-auto object-contain"
                  />
                ))}
              </div>
            </div>
          </motion.aside>

          <div className="min-w-0 w-full flex-1">
            <AnimatePresence mode="wait">
              {paymentStatus === 'success' ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="rounded-3xl border border-cp-border bg-cp-surface/80 p-6 text-center sm:p-8"
                >
                  <CheckCircleIcon className="mx-auto mb-4 h-16 w-16 text-emerald-400" />
                  <h2 className="cp-headline text-2xl">Pagamento confirmado</h2>
                  <p className="mt-2 text-sm text-cp-muted">
                    Seu acesso foi liberado. Entre e comece a estudar agora.
                  </p>

                  {createdCredentials ? (
                    <div className="mt-6 rounded-2xl border border-cp-accent/25 bg-cp-accent/5 p-5 text-left">
                      <h3 className="mb-3 text-sm font-bold text-cp-text">Conta criada</h3>
                      <div className="space-y-3">
                        <div>
                          <p className="mb-1 text-xs font-semibold text-cp-muted">Email de acesso</p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              readOnly
                              value={createdCredentials.email}
                              className={`${inputClass} font-mono`}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(createdCredentials.email)
                                alert('Email copiado!')
                              }}
                              className="shrink-0 rounded-xl border border-cp-border px-3 py-2 text-sm font-semibold text-cp-text transition hover:border-cp-accent/40 hover:bg-cp-accent/10"
                            >
                              Copiar
                            </button>
                          </div>
                        </div>
                        <div>
                          <p className="mb-1 text-xs font-semibold text-cp-muted">Senha</p>
                          <input
                            type="text"
                            readOnly
                            value={createdCredentials.password || 'Verifique seu email'}
                            className={inputClass}
                          />
                          <p className="mt-2 text-xs text-cp-muted">
                            A senha foi enviada por email. Confira a caixa de entrada e o spam.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => navigate('/login')}
                      className="cp-btn-primary justify-center"
                    >
                      Fazer login
                    </button>
                    {user ? (
                      <button
                        type="button"
                        onClick={() => navigate('/dashboard')}
                        className="inline-flex items-center justify-center rounded-xl border border-cp-border px-6 py-3 text-sm font-semibold text-cp-text transition hover:bg-cp-surface"
                      >
                        Ir ao dashboard
                      </button>
                    ) : null}
                    {!reviewDone ? (
                      <button
                        type="button"
                        onClick={() => setReviewOpen(true)}
                        className="inline-flex items-center justify-center rounded-xl border border-cp-accent/40 bg-cp-accent/10 px-6 py-3 text-sm font-semibold text-cp-accent transition hover:bg-cp-accent/20"
                      >
                        Avaliar compra
                      </button>
                    ) : (
                      <p className="inline-flex items-center justify-center text-sm text-emerald-300">
                        Obrigado pela avaliação!
                      </p>
                    )}
                  </div>

                  <AnimatePresence>
                    {reviewOpen && !reviewDone ? (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-6 overflow-hidden text-left"
                      >
                        <div className="rounded-2xl border border-cp-border bg-[var(--cp-bg)]/50 p-5">
                          <p className="mb-3 text-sm font-semibold text-cp-text">
                            Como foi sua experiência?
                          </p>
                          <div className="mb-4 flex gap-2">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => setReviewRating(star)}
                                className={`text-2xl transition ${
                                  star <= reviewRating
                                    ? 'text-amber-400'
                                    : 'text-cp-muted/40 hover:text-amber-300/70'
                                }`}
                                aria-label={`${star} estrela${star > 1 ? 's' : ''}`}
                              >
                                ★
                              </button>
                            ))}
                          </div>
                          <label className={labelClass}>Comentário (opcional)</label>
                          <textarea
                            value={reviewComment}
                            onChange={(e) => setReviewComment(e.target.value)}
                            rows={3}
                            placeholder="Conte o que achou..."
                            className={`${inputClass} resize-none`}
                          />
                          <div className="mt-4 flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={submitPurchaseReview}
                              disabled={reviewSending}
                              className="cp-btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {reviewSending ? 'Enviando...' : 'Enviar avaliação'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setReviewOpen(false)}
                              className="inline-flex items-center justify-center rounded-xl border border-cp-border px-5 py-2.5 text-sm font-semibold text-cp-muted transition hover:bg-cp-surface"
                            >
                              Agora não
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </motion.div>
              ) : paymentStatus === 'pending' ? (
                <motion.div
                  key="checkout-pending"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-3xl border border-cp-border bg-cp-surface/80 p-6 text-center sm:p-8"
                >
                  <ArrowPathIcon className="mx-auto mb-4 h-14 w-14 animate-spin text-cp-accent" />
                  <h2 className="cp-headline text-2xl">Confirmando pagamento</h2>
                  <p className="mt-2 text-sm text-cp-muted">
                    {paymentMethod === 'boleto'
                      ? 'Conclua no Mercado Pago (boleto ou PIX). O acesso libera automaticamente após a confirmação. Boleto pode levar 1–3 dias úteis; PIX costuma ser imediato.'
                      : 'Estamos confirmando seu pagamento no Mercado Pago. Isso pode levar alguns instantes.'}
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="form"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="rounded-3xl border border-cp-border bg-cp-surface/80 p-5 sm:p-8"
                >
                  <div className="mb-6 space-y-4">
                    <div>
                      <p className="mb-3 text-sm font-bold text-cp-text">Dados da conta</p>
                      {user ? (
                        <p className="mb-3 text-xs text-cp-muted">
                          Logado como <span className="text-cp-accent">{user.email}</span>. Confirme os
                          dados abaixo para o recibo e liberação do curso.
                        </p>
                      ) : (
                        <p className="mb-3 text-xs text-cp-muted">
                          Crie sua conta agora. Após o pagamento no Mercado Pago, o acesso é liberado neste email.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className={labelClass}>Email *</label>
                      <input
                        type="email"
                        placeholder="seu@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={inputClass}
                        autoComplete="email"
                        required
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Nome completo *</label>
                      <input
                        type="text"
                        placeholder="Seu nome completo"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={inputClass}
                        autoComplete="name"
                        required
                      />
                    </div>
                    {!user ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className={labelClass}>Senha *</label>
                          <input
                            type="password"
                            placeholder="Mínimo 6 caracteres"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={inputClass}
                            autoComplete="new-password"
                            required
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Confirmar senha *</label>
                          <input
                            type="password"
                            placeholder="Repita a senha"
                            value={passwordConfirm}
                            onChange={(e) => setPasswordConfirm(e.target.value)}
                            className={inputClass}
                            autoComplete="new-password"
                            required
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="mb-6">
                    <label className={labelClass}>Método de pagamento</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentMethod('boleto')
                          setAutoRenew(false)
                        }}
                        className={`rounded-2xl border p-4 text-left transition ${
                          paymentMethod === 'boleto'
                            ? 'border-cp-accent/50 bg-cp-accent/10 shadow-[0_0_24px_-12px_rgba(34,211,238,0.55)]'
                            : 'border-cp-border bg-[var(--cp-bg)]/40 hover:border-cp-accent/30'
                        }`}
                      >
                        <BanknotesIcon
                          className={`mb-2 h-7 w-7 ${
                            paymentMethod === 'boleto' ? 'text-cp-accent' : 'text-cp-muted'
                          }`}
                        />
                        <p
                          className={`text-sm font-semibold ${
                            paymentMethod === 'boleto' ? 'text-cp-text' : 'text-cp-muted'
                          }`}
                        >
                          Boleto
                        </p>
                        <p className="mt-1 text-xs text-cp-muted">Boleto ou PIX no Mercado Pago</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentMethod('card')}
                        className={`rounded-2xl border p-4 text-left transition ${
                          paymentMethod === 'card'
                            ? 'border-cp-accent/50 bg-cp-accent/10 shadow-[0_0_24px_-12px_rgba(34,211,238,0.55)]'
                            : 'border-cp-border bg-[var(--cp-bg)]/40 hover:border-cp-accent/30'
                        }`}
                      >
                        <CreditCardIcon
                          className={`mb-2 h-7 w-7 ${
                            paymentMethod === 'card' ? 'text-cp-accent' : 'text-cp-muted'
                          }`}
                        />
                        <p
                          className={`text-sm font-semibold ${
                            paymentMethod === 'card' ? 'text-cp-text' : 'text-cp-muted'
                          }`}
                        >
                          Cartão
                        </p>
                        <p className="mt-1 text-xs text-cp-muted">Checkout Mercado Pago</p>
                      </button>
                    </div>
                  </div>

                  {paymentMethod === 'boleto' ? (
                    <div className="mb-6 rounded-2xl border border-cp-border bg-[var(--cp-bg)]/40 p-4">
                      <p className="flex items-start gap-2 text-sm text-cp-muted">
                        <BanknotesIcon className="mt-0.5 h-5 w-5 shrink-0 text-cp-accent" />
                        Você será redirecionado ao checkout seguro do Mercado Pago para pagar com{' '}
                        <strong className="text-cp-text">boleto</strong> ou{' '}
                        <strong className="text-cp-text">PIX</strong>. O acesso libera automaticamente
                        após a confirmação.
                      </p>
                    </div>
                  ) : null}

                  {paymentMethod === 'card' ? (
                    <div className="mb-6 space-y-4">
                      <div className="rounded-2xl border border-cp-border bg-[var(--cp-bg)]/40 p-4">
                        <p className="flex items-start gap-2 text-sm text-cp-muted">
                          <CreditCardIcon className="mt-0.5 h-5 w-5 shrink-0 text-cp-accent" />
                          Você será redirecionado ao checkout seguro do Mercado Pago para concluir o
                          pagamento com cartão
                          {accessInfo.canAutoRenew && autoRenew
                            ? ' e ativar a assinatura de renovação automática'
                            : ''}
                          .
                        </p>
                      </div>
                      {accessInfo.canAutoRenew ? (
                        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-cp-accent/30 bg-cp-accent/5 p-4">
                          <input
                            type="checkbox"
                            checked={autoRenew}
                            onChange={(e) => setAutoRenew(e.target.checked)}
                            className="mt-1 h-4 w-4 shrink-0 rounded border-cp-border accent-[var(--cp-accent)]"
                          />
                          <span className="text-xs leading-relaxed text-cp-muted sm:text-sm">
                            <strong className="text-cp-text">Renovar automaticamente no cartão</strong>
                            {' — '}ao fim de {accessInfo.short}, o Mercado Pago cobra de novo e o
                            acesso é prorrogado sem interrupção. Você pode cancelar a assinatura no
                            painel do Mercado Pago.
                          </span>
                        </label>
                      ) : null}
                    </div>
                  ) : null}

                  {errorMessage ? (
                    <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4">
                      <p className="flex items-center gap-2 text-sm text-rose-300">
                        <XCircleIcon className="h-5 w-5 shrink-0" />
                        {errorMessage}
                      </p>
                    </div>
                  ) : null}

                  <label className="mb-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-cp-border bg-[var(--cp-bg)]/40 p-4">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-cp-border accent-[var(--cp-accent)]"
                    />
                    <span className="text-xs leading-relaxed text-cp-muted sm:text-sm">
                      Li e aceito os termos: o acesso a este curso é{' '}
                      <strong className="text-cp-text">
                        {accessInfo.isLifetime
                          ? 'vitalício enquanto o curso permanecer disponível'
                          : `válido pelo período de ${accessInfo.short}`}
                      </strong>
                      {accessInfo.isLifetime
                        ? ', podendo ser encerrado se o administrador remover o curso da plataforma'
                        : '. Após esse prazo o acesso expira automaticamente'}
                      {paymentMethod === 'card' && autoRenew && accessInfo.canAutoRenew
                        ? ', salvo se a renovação automática no cartão estiver ativa e for cobrada com sucesso'
                        : ''}
                      . O pagamento é único por ciclo, o conteúdo é liberado após a confirmação e a
                      garantia de reembolso é de 7 dias em caso de insatisfação.
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={handlePayment}
                    disabled={loading || !acceptedTerms}
                    className="cp-btn-primary flex w-full items-center justify-center gap-2 !py-3.5 !text-base disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <ArrowPathIcon className="h-5 w-5 animate-spin" />
                        Processando...
                      </>
                    ) : (
                      <>
                        <LockClosedIcon className="h-5 w-5" />
                        {`Pagar ${formatCurrency(product.price)} no Mercado Pago`}
                      </>
                    )}
                  </button>

                  <div className="mt-5 flex flex-col items-center justify-center gap-3">
                    <div className="flex items-center gap-2 text-xs text-cp-muted">
                      <LockClosedIcon className="h-4 w-4 text-cp-accent" />
                      <span>Pagamento seguro e criptografado</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                      {PAYMENT_BRANDS.map((brand) => (
                        <img
                          key={brand.src}
                          src={brand.src}
                          alt={brand.alt}
                          className="h-8 w-auto object-contain sm:h-9"
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Carrossel dinâmico das funções do curso */}
            <div className="mt-8 overflow-hidden rounded-3xl border border-cp-border/70 bg-cp-surface/40 py-5">
              <p className="mb-4 px-5 text-xs font-bold uppercase tracking-wider text-cp-muted">
                O que você desbloqueia
                {selectedCourse?.name ? ` em ${selectedCourse.name}` : ''}
              </p>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-[var(--cp-bg)] to-transparent" />
                <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-[var(--cp-bg)] to-transparent" />
                <div className="flex w-max gap-3 px-5 animate-[cp-payment-marquee_32s_linear_infinite] hover:[animation-play-state:paused]">
                  {[...COURSE_FEATURES, ...COURSE_FEATURES].map((feat, idx) => (
                    <div
                      key={`${feat.title}-${idx}`}
                      className={`w-56 shrink-0 rounded-2xl border border-cp-border/80 bg-gradient-to-br ${feat.tone} p-4`}
                    >
                      <p className="text-sm font-bold text-cp-text">{feat.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-cp-muted">{feat.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Payment

