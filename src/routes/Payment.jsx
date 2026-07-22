import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AcademicCapIcon,
  BanknotesIcon,
  CheckCircleIcon,
  CreditCardIcon,
  LockClosedIcon,
  SparklesIcon,
} from '@heroicons/react/24/solid'
import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { trackGoogleAdsConversion } from '../utils/googleAds'
import { hasPurchasedCourse } from '../utils/courseAccess'

const DEFAULT_BENEFITS = [
  'Edital verticalizado completo do concurso',
  'Questões preditivas no estilo da banca',
  'Flashcards e material por tópico',
  'Guia mentorado e trilha de estudos',
  'Acesso liberado na confirmação do pagamento',
]

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function courseImage(course) {
  return course?.imageUrl || course?.imageBase64 || ''
}

function parseBenefits(course) {
  if (Array.isArray(course?.benefits) && course.benefits.length) {
    return course.benefits.map(String).filter(Boolean)
  }
  if (typeof course?.offers === 'string' && course.offers.trim()) {
    return course.offers
      .split(/\n|•|;/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return DEFAULT_BENEFITS
}

export default function Payment() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const courseIdParam = searchParams.get('course') || ''
  const statusParam = searchParams.get('status') || ''
  const txParam = searchParams.get('tx') || ''

  const [course, setCourse] = useState(null)
  const [paymentConfig, setPaymentConfig] = useState({ monthlyEnabled: true })
  const [loadingCourse, setLoadingCourse] = useState(Boolean(courseIdParam))
  const [planType, setPlanType] = useState('lifetime') // lifetime | monthly
  const [payMode, setPayMode] = useState('pix') // pix | checkout | subscription
  const [email, setEmail] = useState(user?.email || '')
  const [name, setName] = useState(profile?.displayName || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [paymentStatus, setPaymentStatus] = useState(null) // pending | success | error
  const [pixCode, setPixCode] = useState('')
  const [pixQr, setPixQr] = useState('')
  const [transactionId, setTransactionId] = useState(txParam || '')
  const [mpPaymentId, setMpPaymentId] = useState('')

  useEffect(() => {
    if (user?.email) setEmail(user.email)
    if (profile?.displayName) setName(profile.displayName)
  }, [user, profile])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const cfg = await getDoc(doc(db, 'config', 'payment'))
        if (!cancelled && cfg.exists()) setPaymentConfig({ monthlyEnabled: true, ...cfg.data() })
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!courseIdParam) {
      setLoadingCourse(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoadingCourse(true)
      try {
        const snap = await getDoc(doc(db, 'courses', courseIdParam))
        if (!cancelled) {
          setCourse(snap.exists() ? { id: snap.id, ...snap.data() } : null)
        }
      } catch (err) {
        console.error(err)
        if (!cancelled) setError('Não foi possível carregar o curso.')
      } finally {
        if (!cancelled) setLoadingCourse(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [courseIdParam])

  // Retorno do Checkout Pro
  useEffect(() => {
    if (statusParam === 'success' || statusParam === 'pending') {
      setPaymentStatus(statusParam === 'success' ? 'success' : 'pending')
      if (txParam) setTransactionId(txParam)
    }
    if (statusParam === 'failure') {
      setPaymentStatus('error')
      setError('Pagamento não concluído. Tente novamente.')
    }
  }, [statusParam, txParam])

  // Listener Firestore + polling MP
  useEffect(() => {
    if (!transactionId || paymentStatus === 'success') return undefined
    const unsub = onSnapshot(doc(db, 'transactions', transactionId), async (snap) => {
      if (!snap.exists()) return
      const data = snap.data()
      if (data.status === 'paid') {
        setPaymentStatus('success')
        if (data.amount) trackGoogleAdsConversion(null, data.amount, transactionId)
        // Garante selectedCourse
        if (user?.uid && data.courseId) {
          await setDoc(
            doc(db, 'users', user.uid),
            {
              selectedCourseId: data.courseId,
              purchasedCourses: Array.from(
                new Set([...(profile?.purchasedCourses || []), data.courseId]),
              ),
              hasActiveSubscription: true,
              lastPaymentDate: serverTimestamp(),
            },
            { merge: true },
          ).catch(() => {})
        }
      }
      if (data.status === 'error') {
        setPaymentStatus('error')
        setError('Pagamento recusado ou expirado.')
      }
    })
    return () => unsub()
  }, [transactionId, paymentStatus, user, profile])

  useEffect(() => {
    if (!mpPaymentId || paymentStatus === 'success') return undefined
    const tick = async () => {
      try {
        const qs = new URLSearchParams({
          paymentId: mpPaymentId,
          transactionId,
          userId: user?.uid || '',
          courseId: course?.id || '',
          planType,
        })
        const res = await fetch(`/api/mercadopago/status?${qs}`)
        const data = await res.json()
        if (data.approved) setPaymentStatus('success')
      } catch {
        /* ignore */
      }
    }
    tick()
    const id = setInterval(tick, 5000)
    return () => clearInterval(id)
  }, [mpPaymentId, paymentStatus, transactionId, user, course, planType])

  const lifetimePrice = Number(course?.price ?? 99.9)
  const originalPrice = Number(course?.originalPrice ?? lifetimePrice)
  const monthlyPrice = Number(
    course?.monthlyPrice ??
      paymentConfig.defaultMonthlyPrice ??
      Math.max(19.9, Math.round(lifetimePrice * 0.25 * 100) / 100),
  )
  const monthlyEnabled =
    paymentConfig.monthlyEnabled !== false && course?.monthlyEnabled !== false

  const amount = planType === 'monthly' ? monthlyPrice : lifetimePrice
  const benefits = useMemo(() => parseBenefits(course), [course])
  const owned = course ? hasPurchasedCourse(profile, course.id) : false
  const img = courseImage(course)

  const effectivePayMode =
    planType === 'monthly' ? (payMode === 'pix' ? 'subscription' : 'subscription') : payMode

  const startPayment = async () => {
    if (!course?.id) {
      setError('Selecione um curso para comprar.')
      return
    }
    if (!email.trim()) {
      setError('Informe seu e-mail.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const txRef = doc(collection(db, 'transactions'))
      const txId = txRef.id
      const mode =
        planType === 'monthly' ? 'subscription' : payMode === 'checkout' ? 'checkout' : 'pix'

      await setDoc(txRef, {
        transactionId: txId,
        userId: user?.uid || null,
        userEmail: email.trim().toLowerCase(),
        userName: name.trim() || email.split('@')[0],
        courseId: course.id,
        courseName: course.name || '',
        planType,
        paymentMethod: mode,
        amount,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      setTransactionId(txId)

      const res = await fetch('/api/mercadopago/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          amount,
          description: `${course.name} — ${planType === 'monthly' ? 'Plano mensal' : 'Acesso completo'}`,
          transactionId: txId,
          userEmail: email.trim().toLowerCase(),
          userName: name.trim() || 'Cliente',
          userId: user?.uid || '',
          courseId: course.id,
          planType,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao criar pagamento')

      if (data.mode === 'pix') {
        setPixCode(data.qrCode || '')
        setPixQr(data.qrCodeBase64 || '')
        setMpPaymentId(String(data.paymentId || ''))
        setPaymentStatus('pending')
        await setDoc(
          txRef,
          {
            mercadopagoPaymentId: String(data.paymentId || ''),
            mercadopagoStatus: data.status || 'pending',
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
      } else if (data.initPoint) {
        window.location.href = data.initPoint
        return
      } else {
        throw new Error('Resposta inválida do Mercado Pago')
      }
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Erro no pagamento')
      setPaymentStatus('error')
    } finally {
      setBusy(false)
    }
  }

  if (loadingCourse) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-cp-accent border-t-transparent" />
      </div>
    )
  }

  if (!courseIdParam || !course) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <AcademicCapIcon className="mx-auto h-12 w-12 text-cp-accent" />
        <h1 className="mt-4 text-2xl font-bold text-cp-text">Escolha um curso para comprar</h1>
        <p className="mt-2 text-sm text-cp-muted">
          Abra a página do curso ou a lista de cursos e clique em Comprar.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/cursos" className="cp-btn-primary">
            Ver cursos
          </Link>
          <Link href="/select-course" className="cp-btn-ghost">
            Selecionar curso
          </Link>
        </div>
      </div>
    )
  }

  if (owned || paymentStatus === 'success') {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <CheckCircleIcon className="mx-auto h-14 w-14 text-emerald-500" />
        <h1 className="mt-4 text-2xl font-bold text-cp-text">Acesso liberado!</h1>
        <p className="mt-2 text-sm text-cp-muted">
          {course.name} já está disponível na sua conta.
        </p>
        <button
          type="button"
          className="cp-btn-primary mt-6"
          onClick={() => navigate('/dashboard')}
        >
          Ir para o dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-cp-accent">Checkout seguro</p>
        <h1 className="mt-1 text-2xl font-bold text-cp-text sm:text-3xl">Finalize sua compra</h1>
        <p className="mt-1 text-sm text-cp-muted">Pagamento via Mercado Pago — PIX, cartão ou assinatura mensal.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Resumo do curso */}
        <section className="overflow-hidden rounded-2xl border border-cp-border bg-cp-surface">
          <div className="relative h-48 bg-gradient-to-br from-cp-accent/20 to-cp-accent2/10 sm:h-56">
            {img ? (
              <img src={img} alt={course.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <AcademicCapIcon className="h-16 w-16 text-cp-accent/50" />
              </div>
            )}
          </div>
          <div className="space-y-4 p-5 sm:p-6">
            <div>
              <h2 className="text-xl font-bold text-cp-text">{course.name}</h2>
              {course.competition && (
                <p className="mt-1 text-sm text-cp-muted">{course.competition}</p>
              )}
              {course.banca && (
                <span className="mt-2 inline-flex rounded-full border border-cp-border px-2.5 py-0.5 text-[11px] text-cp-muted">
                  Banca {course.banca}
                </span>
              )}
            </div>
            {course.description ? (
              <p className="text-sm leading-relaxed text-cp-text/90 whitespace-pre-wrap">{course.description}</p>
            ) : (
              <p className="text-sm text-cp-muted">
                Curso completo no Concurseiro Preditivo com conteúdo gerado por IA alinhado ao edital e à banca.
              </p>
            )}
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-cp-text">
                <SparklesIcon className="h-4 w-4 text-cp-accent" /> O que você recebe
              </h3>
              <ul className="space-y-2">
                {benefits.map((b) => (
                  <li key={b} className="flex gap-2 text-sm text-cp-text/90">
                    <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Planos + pagamento */}
        <section className="rounded-2xl border border-cp-border bg-cp-surface p-5 sm:p-6">
          <h3 className="text-sm font-semibold text-cp-text">Escolha o plano</h3>
          <div className="mt-3 grid gap-3">
            <button
              type="button"
              onClick={() => {
                setPlanType('lifetime')
                setPayMode('pix')
              }}
              className={`rounded-xl border-2 p-4 text-left transition ${
                planType === 'lifetime' ? 'border-cp-accent bg-cp-accent/10' : 'border-cp-border'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-cp-text">Acesso completo</p>
                  <p className="mt-0.5 text-xs text-cp-muted">Pagamento único · PIX ou cartão (até 12x)</p>
                </div>
                <div className="text-right">
                  {originalPrice > lifetimePrice && (
                    <p className="text-xs text-cp-muted line-through">{formatCurrency(originalPrice)}</p>
                  )}
                  <p className="text-lg font-black text-cp-accent">{formatCurrency(lifetimePrice)}</p>
                </div>
              </div>
            </button>

            {monthlyEnabled && (
              <button
                type="button"
                onClick={() => {
                  setPlanType('monthly')
                  setPayMode('subscription')
                }}
                className={`rounded-xl border-2 p-4 text-left transition ${
                  planType === 'monthly' ? 'border-cp-accent bg-cp-accent/10' : 'border-cp-border'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-cp-text">Plano mensal</p>
                    <p className="mt-0.5 text-xs text-cp-muted">Assinatura recorrente · valor reduzido</p>
                  </div>
                  <p className="text-lg font-black text-cp-accent2">
                    {formatCurrency(monthlyPrice)}
                    <span className="text-xs font-medium text-cp-muted">/mês</span>
                  </p>
                </div>
              </button>
            )}
          </div>

          {planType === 'lifetime' && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPayMode('pix')}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold ${
                  payMode === 'pix' ? 'border-cp-accent bg-cp-accent/10 text-cp-accent' : 'border-cp-border'
                }`}
              >
                <BanknotesIcon className="h-4 w-4" /> PIX
              </button>
              <button
                type="button"
                onClick={() => setPayMode('checkout')}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold ${
                  payMode === 'checkout' ? 'border-cp-accent bg-cp-accent/10 text-cp-accent' : 'border-cp-border'
                }`}
              >
                <CreditCardIcon className="h-4 w-4" /> Cartão
              </button>
            </div>
          )}

          <div className="mt-4 space-y-3">
            <label className="block text-xs font-medium text-cp-muted">
              Nome
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-cp-border bg-cp-bg px-3 py-2 text-sm text-cp-text"
                placeholder="Seu nome"
              />
            </label>
            <label className="block text-xs font-medium text-cp-muted">
              E-mail
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-cp-border bg-cp-bg px-3 py-2 text-sm text-cp-text"
                placeholder="voce@email.com"
              />
            </label>
          </div>

          {error && (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          {paymentStatus === 'pending' && pixQr && (
            <div className="mt-4 space-y-3 rounded-xl border border-cp-border bg-cp-bg/60 p-4 text-center">
              <p className="text-sm font-semibold text-cp-text">Escaneie o QR Code PIX</p>
              <img
                src={pixQr.startsWith('data:') ? pixQr : `data:image/png;base64,${pixQr}`}
                alt="QR Code PIX"
                className="mx-auto h-48 w-48 rounded-lg bg-white p-2"
              />
              {pixCode && (
                <button
                  type="button"
                  className="cp-btn-ghost w-full text-xs"
                  onClick={() => navigator.clipboard?.writeText(pixCode)}
                >
                  Copiar código PIX
                </button>
              )}
              <p className="text-xs text-cp-muted">Aguardando confirmação automática…</p>
            </div>
          )}

          <button
            type="button"
            disabled={busy || (paymentStatus === 'pending' && Boolean(pixQr))}
            onClick={startPayment}
            className="cp-btn-primary mt-5 flex w-full items-center justify-center gap-2 disabled:opacity-60"
          >
            <LockClosedIcon className="h-4 w-4" />
            {busy
              ? 'Gerando pagamento…'
              : planType === 'monthly'
                ? `Assinar ${formatCurrency(monthlyPrice)}/mês`
                : payMode === 'pix'
                  ? `Pagar ${formatCurrency(amount)} no PIX`
                  : `Pagar ${formatCurrency(amount)} no cartão`}
          </button>
          <p className="mt-3 text-center text-[11px] text-cp-muted">
            Processado pelo Mercado Pago. Acesso liberado na confirmação.
            {effectivePayMode === 'subscription' ? ' Cobrança mensal recorrente.' : ''}
          </p>
        </section>
      </div>
    </div>
  )
}
