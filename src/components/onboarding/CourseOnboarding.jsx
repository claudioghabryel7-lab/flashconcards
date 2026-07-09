'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { updateProfile } from 'firebase/auth'
import { AnimatePresence, motion } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  AcademicCapIcon,
  BookOpenIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  DocumentTextIcon,
  MapIcon,
  PencilSquareIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline'
import { auth, db } from '../../firebase/config'
import { useAuth } from '../../hooks/useAuth'
import {
  calculateAgeFromBirthDate,
  getMinorConsentRules,
  validateOnboardingProfile,
} from '../../utils/minorConsent'
import { syncUserCommunityIdentity } from '../../services/communityUserService'
import { invalidateCommunityAuthorCache } from '../../hooks/useCommunityAuthors'
import '../../styles/course-onboarding.css'

const HIDDEN_PATHS = ['/login', '/select-course', '/setup']

const TOUR_STEPS = [
  {
    id: 'welcome',
    icon: SparklesIcon,
    accent: 'violet',
    title: 'Sua jornada começa agora!',
    desc: 'Você entrou no ecossistema mais completo para concursos: estudo inteligente, comunidade e progresso em tempo real.',
    href: '/dashboard',
    cta: 'Central do estudante',
    chips: ['IA preditiva', 'Comunidade ativa', 'Progresso visual'],
  },
  {
    id: 'edital',
    icon: MapIcon,
    accent: 'cyan',
    title: 'Edital Verticalizado',
    desc: 'Todo o edital organizado em matérias e tópicos. Marque o que já estudou e acompanhe sua cobertura.',
    href: '/edital-verticalizado',
    cta: 'Ver edital',
  },
  {
    id: 'conteudo',
    icon: BookOpenIcon,
    accent: 'emerald',
    title: 'Conteúdo Programático',
    desc: 'Material completo por tópico, com incidência e comentários da comunidade flutuando ao lado.',
    href: '/conteudo-completo',
    cta: 'Explorar conteúdo',
  },
  {
    id: 'redacao',
    icon: PencilSquareIcon,
    accent: 'pink',
    title: 'Treino de Redação',
    desc: 'Pratique textos dissertativos com correção e evolução contínua rumo à nota máxima.',
    href: '/treino-redacao',
    cta: 'Treinar redação',
  },
  {
    id: 'questoes',
    icon: ChartBarIcon,
    accent: 'amber',
    title: 'Questões',
    desc: 'Resolva questões liberadas, veja gráficos de acertos e comentários flutuantes em cada enunciado.',
    href: '/resolver-questoes',
    cta: 'Resolver questões',
  },
  {
    id: 'flashcards',
    icon: AcademicCapIcon,
    accent: 'violet',
    title: 'Flashcards',
    desc: 'Revisão espaçada (SRS) por deck. Vire os cards, comente e fixe o que precisa revisar.',
    href: '/flashcards',
    cta: 'Estudar flashcards',
  },
  {
    id: 'apoio',
    icon: DocumentTextIcon,
    accent: 'cyan',
    title: 'Material de Apoio',
    desc: 'Resumos, mapas e conteúdos de reforço integrados ao seu curso.',
    href: '/guia-estudos',
    cta: 'Material de apoio',
  },
  {
    id: 'trilha',
    icon: ClockIcon,
    accent: 'emerald',
    title: 'Trilha de Estudos',
    desc: 'Registre tempo líquido, metas e ciclos. Sua evolução fica visível — você escolhe se publica na comunidade.',
    href: '/trilha',
    cta: 'Abrir trilha',
  },
  {
    id: 'comunidade',
    icon: ChatBubbleLeftRightIcon,
    accent: 'pink',
    title: 'Comunidade & Perfil',
    desc: 'Feed de estudos, curtidas e conexões. Em Meu Perfil você define se quer publicar automaticamente sua Trilha.',
    href: '/perfil',
    cta: 'Configurar perfil',
  },
]

const tourVariants = {
  enter: { opacity: 0, x: 36, scale: 0.97, filter: 'blur(6px)' },
  center: { opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' },
  exit: { opacity: 0, x: -28, scale: 0.98, filter: 'blur(4px)' },
}

const phaseVariants = {
  enter: { opacity: 0, y: 18 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
}

function PhaseProgress({ phase, tourIndex }) {
  const total = TOUR_STEPS.length + 2
  const activeIndex =
    phase === 'profile' ? 0 : phase === 'tour' ? tourIndex + 1 : phase === 'lgpd' ? total - 1 : 0
  const pct = Math.round(((activeIndex + 1) / total) * 100)

  return (
    <div className="course-onboarding-progress-wrap">
      <div className="course-onboarding-progress-bar" aria-hidden>
        <motion.div
          className="course-onboarding-progress-fill"
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
      <span className="course-onboarding-progress-label">{pct}%</span>
    </div>
  )
}

export default function CourseOnboarding() {
  const { user, profile } = useAuth()
  const { pathname } = useLocation()
  const needsOnboarding = profile ? !profile.onboardingCompleted : false
  const needsLgpd = profile ? !profile.lgpdConsent : false
  const lgpdOnly = needsLgpd && !needsOnboarding
  const [phase, setPhase] = useState('profile')
  const [tourIndex, setTourIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    displayName: '',
    email: '',
    birthDate: '',
    parentalAck: false,
    shareTrilhaToFeed: true,
    lgpdAccepted: false,
  })
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (!user || !profile) return
    setForm((f) => ({
      ...f,
      displayName: profile.displayName || user.displayName || user.email?.split('@')[0] || '',
      email: profile.email || user.email || '',
      birthDate: profile.birthDate || '',
      shareTrilhaToFeed: profile.shareTrilhaToFeed !== false,
    }))
    if (profile.onboardingCompleted && !profile.lgpdConsent) {
      setPhase('lgpd')
    }
  }, [user, profile])

  const age = useMemo(() => calculateAgeFromBirthDate(form.birthDate), [form.birthDate])
  const minorRules = useMemo(() => getMinorConsentRules(age), [age])

  const tourStep = TOUR_STEPS[tourIndex]
  const TourIcon = tourStep?.icon || SparklesIcon

  const handleProfileNext = () => {
    const { errors: nextErrors, valid } = validateOnboardingProfile(form)
    setErrors(nextErrors)
    if (!valid) return
    setPhase('tour')
    setTourIndex(0)
  }

  const handleTourNext = () => {
    if (tourIndex < TOUR_STEPS.length - 1) {
      setTourIndex((i) => i + 1)
    } else {
      setPhase('lgpd')
    }
  }

  const handleSkipTour = () => {
    setPhase('lgpd')
  }

  const completeOnboarding = useCallback(async () => {
    if (!user?.uid || !form.lgpdAccepted) {
      setErrors((e) => ({
        ...e,
        lgpdAccepted: 'É obrigatório aceitar a Política de Privacidade (LGPD) para usar a plataforma.',
      }))
      return
    }

    if (lgpdOnly) {
      setSaving(true)
      try {
        await setDoc(
          doc(db, 'users', user.uid),
          {
            lgpdConsent: true,
            lgpdConsentDate: new Date().toISOString(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
        toast.success('Consentimento LGPD registrado.', {
          duration: 3000,
          style: { borderRadius: '12px', background: 'var(--cp-bg-elevated)', color: 'var(--cp-text)' },
        })
      } catch (err) {
        console.error('Erro ao salvar consentimento LGPD:', err)
        setErrors({ submit: 'Não foi possível salvar. Tente novamente.' })
      } finally {
        setSaving(false)
      }
      return
    }

    const { valid, errors: profileErrors } = validateOnboardingProfile(form)
    if (!valid) {
      setErrors(profileErrors)
      setPhase('profile')
      return
    }

    setSaving(true)
    try {
      const displayName = form.displayName.trim()
      const computedAge = calculateAgeFromBirthDate(form.birthDate)

      if (auth.currentUser && displayName) {
        await updateProfile(auth.currentUser, { displayName })
      }

      await setDoc(
        doc(db, 'users', user.uid),
        {
          displayName,
          email: form.email.trim(),
          birthDate: form.birthDate,
          age: computedAge,
          isMinor: computedAge != null && computedAge < 18,
          parentalConsentAcknowledged: minorRules.requiresParentalAck ? form.parentalAck : null,
          parentalConsentAt: minorRules.requiresParentalAck && form.parentalAck ? new Date().toISOString() : null,
          shareTrilhaToFeed: form.shareTrilhaToFeed,
          lgpdConsent: true,
          lgpdConsentDate: new Date().toISOString(),
          onboardingCompleted: true,
          onboardingCompletedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )

      await syncUserCommunityIdentity(user.uid, {
        displayName,
        photoBase64: profile?.photoBase64 || null,
      })
      invalidateCommunityAuthorCache(user.uid)

      toast.success('Tudo pronto! Bora estudar! 🚀', {
        duration: 4000,
        style: { borderRadius: '12px', background: 'var(--cp-bg-elevated)', color: 'var(--cp-text)' },
      })
    } catch (err) {
      console.error('Erro ao concluir onboarding:', err)
      setErrors({ submit: 'Não foi possível salvar. Tente novamente.' })
    } finally {
      setSaving(false)
    }
  }, [user, form, minorRules.requiresParentalAck, lgpdOnly])

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return

      if (e.key === 'Escape' && phase === 'tour') handleSkipTour()
      if (e.key === 'Enter' && !saving) {
        if (phase === 'profile') handleProfileNext()
        else if (phase === 'tour') handleTourNext()
        else if (phase === 'lgpd' && form.lgpdAccepted) completeOnboarding()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, tourIndex, saving, completeOnboarding, form.lgpdAccepted])

  if (!user || !profile) return null
  if (!needsOnboarding && !needsLgpd) return null
  if (profile.selectedCourseId == null) return null
  if (HIDDEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null

  return (
    <div className="course-onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="co-title">
      <motion.div
        className="course-onboarding-shell"
        initial={{ opacity: 0, scale: 0.92, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 140, damping: 18 }}
      >
        <div className="course-onboarding-aurora" aria-hidden />
        <div className="course-onboarding-grid" aria-hidden />
        <span className="course-onboarding-spark" aria-hidden />
        <span className="course-onboarding-spark" aria-hidden />
        <span className="course-onboarding-spark" aria-hidden />
        <span className="course-onboarding-spark" aria-hidden />

        <div className="course-onboarding-body">
          <header className="course-onboarding-header">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <motion.span
                  className="cp-badge cp-badge-accent text-[10px]"
                  animate={{ opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 2.4, repeat: Infinity }}
                >
                  {lgpdOnly ? 'Consentimento obrigatório' : 'Primeiro acesso ao curso'}
                </motion.span>
                <h2 id="co-title" className="cp-headline mt-2 text-xl sm:text-2xl">
                  {lgpdOnly ? (
                    <>
                      Aceite a <span className="cp-gradient-text">Política de Privacidade</span>
                    </>
                  ) : (
                    <>
                      Bem-vindo à <span className="cp-gradient-text">nova experiência</span>
                    </>
                  )}
                </h2>
              </div>
              <PhaseProgress phase={phase} tourIndex={tourIndex} />
            </div>
          </header>

          <div className="course-onboarding-scroll">
            <AnimatePresence mode="wait">
              {phase === 'profile' && (
                <motion.div
                  key="profile"
                  variants={phaseVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.35 }}
                  className="space-y-4"
                >
                  <p className="text-sm text-cp-muted">
                    Antes do tour, precisamos de alguns dados obrigatórios para sua segurança e conformidade com a
                    LGPD.
                  </p>

                  <label className="course-onboarding-field">
                    Nome completo *
                    <input
                      className={`course-onboarding-input ${errors.displayName ? 'is-error' : ''}`}
                      value={form.displayName}
                      onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                      placeholder="Como você quer ser chamado"
                      autoComplete="name"
                    />
                    {errors.displayName && <p className="course-onboarding-error">{errors.displayName}</p>}
                  </label>

                  <label className="course-onboarding-field">
                    E-mail *
                    <input
                      type="email"
                      className={`course-onboarding-input ${errors.email ? 'is-error' : ''}`}
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="seu@email.com"
                      autoComplete="email"
                    />
                    {errors.email && <p className="course-onboarding-error">{errors.email}</p>}
                  </label>

                  <label className="course-onboarding-field">
                    Data de nascimento *
                    <input
                      type="date"
                      className={`course-onboarding-input ${errors.birthDate ? 'is-error' : ''}`}
                      value={form.birthDate}
                      onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value, parentalAck: false }))}
                      max={new Date().toISOString().slice(0, 10)}
                    />
                    {errors.birthDate && <p className="course-onboarding-error">{errors.birthDate}</p>}
                    {age != null && age >= 18 && (
                      <p className="mt-1 text-xs text-emerald-500">Idade confirmada: {age} anos ✓</p>
                    )}
                  </label>

                  {minorRules.requiresParentalAck && (
                    <div className="course-onboarding-minor-box">
                      <p className="font-semibold text-amber-400">{minorRules.title}</p>
                      <p className="mt-1">{minorRules.message}</p>
                      <label className="course-onboarding-check">
                        <input
                          type="checkbox"
                          checked={form.parentalAck}
                          onChange={(e) => setForm((f) => ({ ...f, parentalAck: e.target.checked }))}
                        />
                        <span>
                          Confirmo que tenho autorização dos pais ou responsáveis legais para usar a plataforma e
                          compartilhar meus dados de estudo conforme a política de privacidade.
                        </span>
                      </label>
                      {errors.parentalAck && <p className="course-onboarding-error">{errors.parentalAck}</p>}
                    </div>
                  )}
                </motion.div>
              )}

              {phase === 'tour' && tourStep && (
                <motion.div
                  key={tourStep.id}
                  className={`course-onboarding-tour-card is-accent-${tourStep.accent || 'violet'}`}
                  variants={tourVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: 'spring', stiffness: 200, damping: 24 }}
                >
                  <motion.div
                    className="course-onboarding-tour-icon"
                    animate={{ rotate: [0, -4, 4, 0], scale: [1, 1.06, 1] }}
                    transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <TourIcon className="h-7 w-7" />
                  </motion.div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cp-accent">
                    Passo {tourIndex + 1} de {TOUR_STEPS.length}
                  </p>
                  <h3 className="course-onboarding-tour-title">{tourStep.title}</h3>
                  <p className="course-onboarding-tour-desc">{tourStep.desc}</p>

                  {tourStep.chips && (
                    <div className="course-onboarding-chips">
                      {tourStep.chips.map((chip, i) => (
                        <motion.span
                          key={chip}
                          className="course-onboarding-chip"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.12 + i * 0.08 }}
                        >
                          {chip}
                        </motion.span>
                      ))}
                    </div>
                  )}

                  <Link to={tourStep.href} className="course-onboarding-tour-link">
                    {tourStep.cta} →
                  </Link>

                  {tourStep.id === 'comunidade' && (
                    <label className="course-onboarding-check mt-4 rounded-xl border border-cp-border bg-cp-bg/40 p-3">
                      <input
                        type="checkbox"
                        checked={form.shareTrilhaToFeed}
                        onChange={(e) => setForm((f) => ({ ...f, shareTrilhaToFeed: e.target.checked }))}
                      />
                      <span>
                        <UserCircleIcon className="mr-1 inline h-4 w-4" />
                        Publicar automaticamente minha Trilha na comunidade (você pode mudar isso depois em{' '}
                        <Link to="/perfil" className="text-cp-accent underline">
                          Meu Perfil
                        </Link>
                        )
                      </span>
                    </label>
                  )}
                </motion.div>
              )}

              {phase === 'lgpd' && (
                <motion.div
                  key="lgpd"
                  variants={phaseVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.35 }}
                  className="space-y-4"
                >
                  <div className="course-onboarding-tour-card is-accent-cyan">
                    <motion.div
                      className="course-onboarding-tour-icon"
                      animate={{ boxShadow: ['0 0 16px rgba(8,145,178,0.2)', '0 0 32px rgba(8,145,178,0.45)', '0 0 16px rgba(8,145,178,0.2)'] }}
                      transition={{ duration: 2.2, repeat: Infinity }}
                    >
                      <ShieldCheckIcon className="h-7 w-7" />
                    </motion.div>
                    <h3 className="course-onboarding-tour-title">Proteção de Dados (LGPD)</h3>
                    <p className="course-onboarding-tour-desc">
                      Coletamos apenas o necessário para personalizar seu estudo: progresso, preferências, interações na
                      comunidade e dados de conta. Você controla o que publica no feed e pode solicitar exclusão a
                      qualquer momento.
                    </p>
                    <ul className="mt-3 space-y-1.5 text-xs text-cp-muted">
                      <li>• Dados tratados conforme a Lei 13.709/2018 (LGPD)</li>
                      <li>• Menores: consentimento dos pais/responsáveis (Art. 14)</li>
                      <li>• Telefone e foto são opcionais — configure em Meu Perfil</li>
                    </ul>
                    <a
                      href="/politica-privacidade"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="course-onboarding-tour-link"
                    >
                      Ler Política de Privacidade →
                    </a>
                  </div>

                  <label className="course-onboarding-check rounded-xl border border-cp-border bg-cp-bg/30 p-3">
                    <input
                      type="checkbox"
                      required
                      checked={form.lgpdAccepted}
                      onChange={(e) => setForm((f) => ({ ...f, lgpdAccepted: e.target.checked }))}
                    />
                    <span>
                      <strong className="text-cp-text">Obrigatório *</strong> — Li e aceito a Política de Privacidade
                      e autorizo o tratamento dos meus dados para fins educacionais nesta plataforma, conforme a LGPD
                      (Lei 13.709/2018).
                    </span>
                  </label>
                  {errors.lgpdAccepted && <p className="course-onboarding-error">{errors.lgpdAccepted}</p>}
                  {errors.submit && <p className="course-onboarding-error">{errors.submit}</p>}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <footer className="course-onboarding-footer">
            <div className="text-[10px] text-cp-muted">
              {phase === 'profile' && 'Etapa 1 — Dados obrigatórios'}
              {phase === 'tour' && `Tour ${tourIndex + 1}/${TOUR_STEPS.length} — pode pular (Esc)`}
              {phase === 'lgpd' && 'Etapa final — Aceite LGPD obrigatório'}
            </div>
            <div className="flex flex-wrap gap-2">
              {phase === 'tour' && (
                <button type="button" onClick={handleSkipTour} className="cp-btn-ghost text-xs">
                  Pular tour
                </button>
              )}
              {phase === 'profile' && (
                <button type="button" onClick={handleProfileNext} className="cp-btn-primary text-sm">
                  Continuar para o tour →
                </button>
              )}
              {phase === 'tour' && (
                <button type="button" onClick={handleTourNext} className="cp-btn-primary text-sm">
                  {tourIndex < TOUR_STEPS.length - 1 ? 'Próximo →' : 'Ir para LGPD →'}
                </button>
              )}
              {phase === 'lgpd' && (
                <button
                  type="button"
                  onClick={completeOnboarding}
                  disabled={saving || !form.lgpdAccepted}
                  className="cp-btn-primary text-sm inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {saving ? (
                    'Salvando…'
                  ) : (
                    <>
                      <RocketLaunchIcon className="h-4 w-4" />
                      {lgpdOnly ? 'Aceitar e continuar' : 'Começar a estudar!'}
                    </>
                  )}
                </button>
              )}
            </div>
          </footer>
        </div>
      </motion.div>
    </div>
  )
}
