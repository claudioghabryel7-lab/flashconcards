'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, BarChart3, Brain, Layers, Sparkles } from 'lucide-react'
import CPHeroWatermark from './CPHeroWatermark'

const features = [
  {
    icon: Layers,
    num: '01',
    title: 'Edital estruturado',
    text: 'Conteúdo por tópico e disciplina — precisão cirúrgica, zero ruído.',
    accent: 'cp-card-accent-violet',
    iconColor: 'text-cp-accent',
    iconBg: 'bg-cp-accent/10 border-cp-accent/20',
  },
  {
    icon: Brain,
    num: '02',
    title: 'Engine preditiva',
    text: 'IA calibrada na banca e no padrão real do concurso escolhido.',
    accent: 'cp-card-accent-cyan',
    iconColor: 'text-cp-accent2',
    iconBg: 'bg-cp-accent2/10 border-cp-accent2/20',
  },
  {
    icon: BarChart3,
    num: '03',
    title: 'Métricas em tempo real',
    text: 'Simulados, progresso e edital verticalizado num painel unificado.',
    accent: 'cp-card-accent-pink',
    iconColor: 'text-cp-accent3',
    iconBg: 'bg-cp-accent3/10 border-cp-accent3/20',
  },
  {
    icon: Sparkles,
    num: '04',
    title: 'Geração instantânea',
    text: 'Flashcards e questões criados em segundos, prontos para revisão.',
    accent: 'cp-card-accent-amber',
    iconColor: 'text-cp-accent4',
    iconBg: 'bg-cp-accent4/10 border-cp-accent4/20',
  },
]

export default function CPHero() {
  return (
    <section className="relative w-full overflow-hidden pb-28 pt-20 sm:pt-28">
      <div className="cp-container-wide relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto max-w-4xl text-center"
        >
          <CPHeroWatermark />

          <div className="relative z-10 mb-8 flex flex-wrap items-center justify-center gap-2 pt-1">
            <span className="cp-badge cp-badge-accent">Preditivo v2.0</span>
            <span className="cp-badge cp-badge-cyan">IA · Edital · Banca</span>
          </div>

          <h1 className="relative z-10 cp-headline text-4xl sm:text-6xl lg:text-7xl">
            Estude com
            <span className="block cp-gradient-text">inteligência preditiva.</span>
          </h1>

          <p className="relative z-10 mx-auto mt-8 max-w-xl text-base leading-relaxed text-cp-muted sm:text-lg">
            Concurseiro Preditivo combina análise de edital, padrão de banca e IA generativa
            numa plataforma refinada — feita para quem exige precisão.
          </p>

          <div className="relative z-10 mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/cursos" className="cp-btn-primary min-w-[200px]">
              Explorar cursos
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/login" className="cp-btn-ghost min-w-[160px]">
              Entrar
            </Link>
          </div>

          <div className="cp-glass-panel relative z-10 mx-auto mt-16 max-w-lg overflow-hidden text-left">
            <div className="flex items-center gap-2 border-b border-cp-border px-5 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
              <span className="ml-2 font-mono text-[10px] text-cp-muted">pipeline.init</span>
            </div>
            <div className="space-y-2 px-5 py-4 font-mono text-xs leading-relaxed sm:text-[13px]">
              <p className="text-cp-muted">
                <span className="text-cp-accent2">→</span> edital.parse()
                <span className="ml-3 text-cp-success">done</span>
              </p>
              <p className="text-cp-muted">
                <span className="text-cp-accent2">→</span> banca.analyze()
                <span className="ml-3 text-cp-accent4">847 patterns</span>
              </p>
              <p className="text-cp-muted">
                <span className="text-cp-accent2">→</span> trilha.build()
                <span className="ml-3 text-cp-accent">awaiting course</span>
                <span className="cp-cursor" />
              </p>
            </div>
          </div>
        </motion.div>

        <div className="mt-24 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((item, index) => {
            const Icon = item.icon
            return (
              <motion.div
                key={item.num}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * index, duration: 0.6 }}
                className={`cp-card group p-6 ${item.accent}`}
              >
                <div className="mb-5 flex items-center justify-between">
                  <span className="font-mono text-[11px] text-cp-muted">{item.num}</span>
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-xl border transition ${item.iconBg} ${item.iconColor} group-hover:shadow-cp-glow`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <h3 className="text-sm font-medium tracking-tight text-cp-text">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-cp-muted">{item.text}</p>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
