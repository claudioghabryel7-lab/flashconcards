'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { collection, getDocs, query, where, limit } from 'firebase/firestore'
import {
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react'
import { db, initFirebase, firebaseInitialized } from '@/firebase/config'
import CourseCoverMedia from '@/components/cp/CourseCoverMedia'

const BANCAS = ['Cebraspe', 'FGV', 'VUNESP', 'FCC', 'Instituto AOCP', 'IBFC', 'Consulplan', 'Quadrix']

const PIPELINE_STEPS = [
  { cmd: 'edital.parse()', status: 'done', detail: 'tópicos mapeados' },
  { cmd: 'banca.analyze()', status: 'active', detail: 'padrão Cebraspe' },
  { cmd: 'questoes.generate()', status: 'pending', detail: 'nível adaptativo' },
  { cmd: 'flashcards.build()', status: 'pending', detail: 'revisão espaçada' },
]

const STATS = [
  { label: 'Bancas suportadas', value: '12+', suffix: '' },
  { label: 'Níveis de questão', value: '10', suffix: '' },
  { label: 'Geração com IA', value: '<', suffix: '30s' },
]

type Course = {
  id: string
  name?: string
  competition?: string
  banca?: string
  imageUrl?: string
  imageBase64?: string
  featured?: boolean
}

export function BancaMarquee() {
  const items = [...BANCAS, ...BANCAS]
  return (
    <div className="relative mt-14 overflow-hidden border-y border-cp-border/60 bg-cp-surface/30 py-3">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-cp-bg to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-cp-bg to-transparent" />
      <motion.div
        className="flex w-max gap-8 whitespace-nowrap font-mono text-xs text-cp-muted"
        animate={{ x: ['0%', '-50%'] }}
        transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
      >
        {items.map((banca, i) => (
          <span key={`${banca}-${i}`} className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-cp-accent2/80" />
            {banca}
          </span>
        ))}
      </motion.div>
    </div>
  )
}

export function LivePipeline() {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % PIPELINE_STEPS.length), 2200)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="cp-glass-panel relative z-10 mx-auto mt-16 max-w-lg overflow-hidden text-left">
      <div className="flex items-center gap-2 border-b border-cp-border px-5 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        <span className="ml-2 font-mono text-[10px] text-cp-muted">concurseiro-preditivo · pipeline</span>
      </div>
      <div className="space-y-2 px-5 py-4 font-mono text-xs leading-relaxed sm:text-[13px]">
        {PIPELINE_STEPS.map((line, i) => {
          const isActive = i === step
          const isDone = i < step
          return (
            <motion.p
              key={line.cmd}
              animate={{ opacity: isActive || isDone ? 1 : 0.45 }}
              className="text-cp-muted"
            >
              <span className="text-cp-accent2">→</span> {line.cmd}
              <span
                className={`ml-3 ${
                  isDone ? 'text-cp-success' : isActive ? 'text-cp-accent4' : 'text-cp-muted/60'
                }`}
              >
                {isDone ? 'done' : isActive ? line.detail : '…'}
              </span>
              {isActive && <span className="cp-cursor" />}
            </motion.p>
          )
        })}
      </div>
    </div>
  )
}

export function StatsStrip() {
  return (
    <div className="mt-20 grid gap-4 sm:grid-cols-3">
      {STATS.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.08 }}
          className="cp-card cp-card-accent-violet p-5 text-center"
        >
          <p className="font-mono text-2xl font-semibold text-cp-text sm:text-3xl">
            {stat.value}
            <span className="text-cp-accent2">{stat.suffix}</span>
          </p>
          <p className="mt-1 text-xs text-cp-muted">{stat.label}</p>
        </motion.div>
      ))}
    </div>
  )
}

export function HowItWorks() {
  const steps = [
    {
      icon: BookOpen,
      title: 'Escolha o concurso',
      text: 'Selecione o curso com edital e banca já configurados pelo admin.',
    },
    {
      icon: Target,
      title: 'Estude por tópico',
      text: 'Resumo completo, questões preditivas e flashcards gerados para cada item do edital.',
    },
    {
      icon: Zap,
      title: 'Pratique no estilo da banca',
      text: 'Cebraspe, FGV, VUNESP — a IA adapta enunciados e dificuldade ao seu concurso.',
    },
  ]

  return (
    <section className="mt-28" aria-labelledby="como-funciona">
      <div className="text-center">
        <span className="cp-badge cp-badge-cyan">Como funciona</span>
        <h2 id="como-funciona" className="mt-4 text-2xl font-medium tracking-tight text-cp-text sm:text-3xl">
          Do edital à aprovação com o <span className="cp-gradient-text">Concurseiro Preditivo</span>
        </h2>
      </div>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {steps.map((step, i) => {
          const Icon = step.icon
          return (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="cp-card group p-6"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-cp-accent/20 bg-cp-accent/10 text-cp-accent">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-medium text-cp-text">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-cp-muted">{step.text}</p>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}

export function FeaturedCourses() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        initFirebase()
        if (!firebaseInitialized || !db) return
        const q = query(
          collection(db, 'courses'),
          where('active', '==', true),
          limit(6),
        )
        const snap = await getDocs(q)
        // id do documento por último — evita sobrescrita se o payload tiver campo `id`
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id })) as Course[]
        list.sort((a, b) => {
          if (a.featured && !b.featured) return -1
          if (!a.featured && b.featured) return 1
          return (a.name || '').localeCompare(b.name || '', 'pt-BR')
        })
        if (!cancelled) setCourses(list.slice(0, 3))
      } catch {
        if (!cancelled) setCourses([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (!loading && courses.length === 0) return null

  return (
    <section className="mt-28" aria-labelledby="cursos-destaque">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <span className="cp-badge cp-badge-accent">Concursos ativos</span>
          <h2 id="cursos-destaque" className="mt-4 text-2xl font-medium tracking-tight text-cp-text sm:text-3xl">
            Comece a estudar agora
          </h2>
          <p className="mt-2 max-w-lg text-sm text-cp-muted">
            Cursos com edital verticalizado, questões preditivas e material por tópico no Concurseiro Preditivo.
          </p>
        </div>
        <Link href="/cursos" className="cp-btn-ghost text-sm">
          Ver todos
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="cp-card h-48 animate-pulse bg-cp-surface/50" />
            ))
          : courses.map((course, i) => (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
              >
                <Link
                  href={`/curso/${course.id}`}
                  className="cp-card group flex h-full flex-col overflow-hidden p-0 transition hover:border-cp-accent/30"
                >
                  <div className="relative h-32 overflow-hidden bg-cp-surface">
                    {(course.imageUrl || course.imageBase64) && (
                      <CourseCoverMedia
                        src={course.imageUrl || course.imageBase64 || ''}
                        alt={course.name || 'Curso'}
                      />
                    )}
                    {course.banca && (
                      <span className="absolute bottom-2 left-2 z-10 cp-badge cp-badge-cyan text-[10px]">
                        {course.banca}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="line-clamp-2 text-sm font-medium text-cp-text group-hover:text-cp-accent2">
                      {course.name}
                    </h3>
                    {course.competition && (
                      <p className="mt-1 line-clamp-1 text-xs text-cp-muted">{course.competition}</p>
                    )}
                    <span className="mt-auto flex items-center gap-1 pt-3 text-xs text-cp-accent2">
                      Acessar curso
                      <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              </motion.div>
            ))}
      </div>
    </section>
  )
}

export function HomeFaq() {
  const [open, setOpen] = useState(0)
  const items = [
    {
      q: 'O que é o Concurseiro Preditivo?',
      a: 'É a plataforma que une edital verticalizado, IA e padrão de banca para gerar resumos, questões preditivas, flashcards e simulados personalizados ao seu concurso.',
    },
    {
      q: 'As questões seguem o estilo da minha banca?',
      a: 'Sim. Ao configurar Cebraspe, FGV, VUNESP ou outra banca no curso, todo o material gerado — incluindo questões por tópico e prática de incidência — adapta formato e dificuldade.',
    },
    {
      q: 'Preciso pagar para testar?',
      a: 'Explore os cursos disponíveis e crie sua conta. Cada curso pode ter regras de acesso definidas pelo administrador da plataforma.',
    },
  ]

  return (
    <section className="mt-28 pb-8" aria-labelledby="faq-concurseiro">
      <div className="text-center">
        <span className="cp-badge cp-badge-accent">FAQ</span>
        <h2 id="faq-concurseiro" className="mt-4 text-2xl font-medium tracking-tight text-cp-text sm:text-3xl">
          Perguntas sobre o Concurseiro Preditivo
        </h2>
      </div>
      <div className="mx-auto mt-10 max-w-2xl space-y-2">
        {items.map((item, i) => (
          <div key={item.q} className="cp-card overflow-hidden">
            <button
              type="button"
              onClick={() => setOpen(open === i ? -1 : i)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-cp-text"
            >
              {item.q}
              <ChevronRight
                className={`h-4 w-4 shrink-0 text-cp-muted transition ${open === i ? 'rotate-90' : ''}`}
              />
            </button>
            <AnimatePresence initial={false}>
              {open === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <p className="border-t border-cp-border px-5 py-4 text-sm leading-relaxed text-cp-muted">
                    {item.a}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </section>
  )
}

export function CtaBanner() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="relative mt-20 overflow-hidden rounded-2xl border border-cp-accent/20 bg-gradient-to-br from-cp-accent/10 via-cp-surface to-cp-accent2/10 p-8 text-center sm:p-12"
    >
      <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-cp-accent/20 blur-3xl" />
      <Brain className="relative mx-auto h-10 w-10 text-cp-accent2" />
      <h2 className="relative mt-4 text-xl font-medium text-cp-text sm:text-2xl">
        Estude com inteligência preditiva
      </h2>
      <p className="relative mx-auto mt-3 max-w-md text-sm text-cp-muted">
        Junte-se ao Concurseiro Preditivo — a forma mais rápida de ir do edital à prática com IA calibrada na sua banca.
      </p>
      <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link href="/cursos" className="cp-btn-primary min-w-[200px]">
          <Sparkles className="h-4 w-4" />
          Ver concursos
        </Link>
        <Link href="/login" className="cp-btn-ghost min-w-[160px]">
          Criar conta grátis
        </Link>
      </div>
      <ul className="relative mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-cp-muted">
        {['Edital verticalizado', 'Questões preditivas', 'Flashcards IA', 'Simulados'].map((t) => (
          <li key={t} className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-cp-success" />
            {t}
          </li>
        ))}
      </ul>
    </motion.section>
  )
}
