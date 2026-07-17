'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown,
  Loader2,
  MessageCircle,
  Minus,
  Send,
  Sparkles,
  X,
} from 'lucide-react'
import { extractGeneratedText } from '@/utils/geminiApi'
import { formatCoursePrice, getCourseAccessLabel } from '@/utils/courseAccess'

const CONSULTANT_IMAGE = '/images/sales-consultant.png'
const MAX_HISTORY_TURNS = 3
const MAX_INPUT_CHARS = 280
const MAX_AI_REPLIES = 10

const QUICK_PROMPTS_COURSE = [
  'Este curso é para mim?',
  'Como funciona o pagamento?',
  'Quanto tempo de acesso?',
  'O que está incluso?',
]

const QUICK_PROMPTS_HOME = [
  'Como funciona a plataforma?',
  'Quais cursos vocês têm?',
  'Vale a pena investir?',
  'Como funciona o pagamento?',
]

function trimHistory(messages) {
  const dialog = messages.filter((m) => m.role === 'user' || m.role === 'assistant')
  return dialog.slice(-MAX_HISTORY_TURNS * 2)
}

function buildCoursePrompt(course) {
  const price = formatCoursePrice(course?.price) || 'na página'
  const access = getCourseAccessLabel(course || {})
  const desc = String(course?.description || '').replace(/\s+/g, ' ').slice(0, 180)
  return `Consultora de vendas Concurseiro Preditivo. PT-BR. Máx 3 frases. Persuasiva, sem pressão.
Curso: ${course?.name || '—'} | ${course?.competition || '—'} | Banca ${course?.banca || '—'}
Preço: ${price} | Acesso: ${access.short}
Incluso: edital verticalizado, flashcards IA, questões preditivas, Guia Mentorado.
${desc ? `Resumo: ${desc}` : ''}
Não invente edital/vagas. Sugira "Adquirir curso" quando couber.`
}

function buildHomePrompt() {
  return `Consultora Concurseiro Preditivo. PT-BR. Máx 3 frases. Persuasiva, sem pressão.
Plataforma: estudo preditivo por banca, edital verticalizado, flashcards IA, questões no estilo da prova, Guia Mentorado.
Indique /cursos para ver ofertas. Pagamento PIX ou cartão; acesso após confirmação.
Não invente preços específicos sem dados.`
}

function getCannedReply(text, { course, variant }) {
  const q = String(text || '').trim()
  const access = course ? getCourseAccessLabel(course) : null
  const price = course ? formatCoursePrice(course.price) : null

  const shared = {
    'Como funciona o pagamento?':
      'PIX libera na hora; cartão em até 6x. Após a confirmação, o acesso entra automaticamente na sua conta — sem burocracia.',
    'Como funciona a plataforma?':
      'Você estuda pelo edital verticalizado, treina com flashcards e questões no padrão da banca e usa IA para focar no que mais cai. Tudo num só lugar.',
    'Quais cursos vocês têm?':
      'Temos cursos por concurso e banca. Abra a página Cursos para ver as ofertas ativas e escolher a sua prova.',
    'Vale a pena investir?':
      'Se você quer parar de estudar material genérico e treinar no padrão real da banca, a plataforma economiza tempo e aumenta sua confiança na prova.',
  }

  if (shared[q]) return shared[q]

  if (variant === 'course' && course) {
    const courseMap = {
      'Quanto tempo de acesso?': `O acesso é ${access.short}. ${access.isLifetime ? 'Vitalício enquanto o curso estiver disponível na plataforma.' : 'Após o período, você pode renovar se precisar.'}`,
      'O que está incluso?':
        'Edital verticalizado, flashcards com IA, questões preditivas, Guia Mentorado e conteúdo organizado por tópico do edital.',
      'Este curso é para mim?': `Se você vai prestar ${course.competition || 'este concurso'}${course.banca ? ` (${course.banca})` : ''}, sim — o material é montado para essa prova, não é genérico.`,
    }
    if (courseMap[q]) return courseMap[q]
    if (q.toLowerCase().includes('preço') || q.toLowerCase().includes('quanto custa')) {
      return `O investimento é ${price}. Inclui ${access.short.toLowerCase()} com todo o ecossistema preditivo do curso.`
    }
  }

  return null
}

async function fetchAssistantReply({ course, variant, messages }) {
  const history = trimHistory(messages)
    .map((m) => `${m.role === 'user' ? 'U' : 'C'}: ${m.text.slice(0, 200)}`)
    .join('\n')

  const system = variant === 'home' ? buildHomePrompt() : buildCoursePrompt(course)
  const prompt = `${system}\n\n${history}\nC:`

  const res = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      models: ['gemini-2.5-flash'],
      generationConfig: { temperature: 0.45, maxOutputTokens: 180 },
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error || 'Não foi possível obter resposta agora.')
  }

  const text = extractGeneratedText(data)?.trim()
  if (!text) throw new Error('Resposta vazia. Tente novamente.')
  return text.slice(0, 600)
}

export default function SalesAssistantChat({
  course = null,
  checkoutHref = '/cursos',
  defaultOpen = false,
  variant = 'course',
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [minimized, setMinimized] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState([])
  const [aiReplyCount, setAiReplyCount] = useState(0)
  const listRef = useRef(null)

  const quickPrompts = variant === 'home' ? QUICK_PROMPTS_HOME : QUICK_PROMPTS_COURSE

  const welcome = useMemo(() => {
    if (variant === 'home') {
      return 'Olá! Sou a consultora do Concurseiro Preditivo. Posso te ajudar a escolher o curso ideal e entender como acelerar sua aprovação. O que você gostaria de saber?'
    }
    if (course?.name) {
      return `Olá! Sou sua consultora aqui no Concurseiro Preditivo. Posso te explicar o curso ${course.name} e como ele te prepara para a prova. Qual é sua dúvida?`
    }
    return 'Olá! Posso tirar suas dúvidas sobre este curso e ajudar você a decidir com segurança.'
  }, [course?.name, variant])

  const subtitle = useMemo(() => {
    if (variant === 'home') return 'Especialista em concursos'
    return course?.name ? `Especialista em ${course.name}` : 'Consultora de vendas'
  }, [course?.name, variant])

  useEffect(() => {
    if (!open || messages.length) return
    setMessages([{ id: 'welcome', role: 'assistant', text: welcome }])
  }, [open, messages.length, welcome])

  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, loading, open])

  const sendMessage = useCallback(
    async (text) => {
      const trimmed = String(text || '').trim().slice(0, MAX_INPUT_CHARS)
      if (!trimmed || loading) return
      if (variant === 'course' && !course) return

      const userMsg = { id: `u-${Date.now()}`, role: 'user', text: trimmed }
      setMessages((prev) => [...prev, userMsg])
      setInput('')
      setLoading(true)

      try {
        const canned = getCannedReply(trimmed, { course, variant })
        if (canned) {
          setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: canned }])
          return
        }

        if (aiReplyCount >= MAX_AI_REPLIES) {
          setMessages((prev) => [
            ...prev,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              text: 'Para mais detalhes, acesse a página de cursos ou finalize sua compra pelo botão abaixo. Estou à disposição para dúvidas objetivas!',
            },
          ])
          return
        }

        const reply = await fetchAssistantReply({
          course,
          variant,
          messages: [...messages, userMsg],
        })
        setAiReplyCount((n) => n + 1)
        setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: reply }])
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: 'assistant',
            text:
              err?.message ||
              'Estou com instabilidade no momento. Use o botão de pagamento ou veja todos os cursos.',
          },
        ])
      } finally {
        setLoading(false)
      }
    },
    [aiReplyCount, course, loading, messages, variant],
  )

  const handleClose = () => {
    setOpen(false)
    setMinimized(false)
  }

  if (variant === 'course' && !course) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-end px-3 pb-3 sm:px-5 sm:pb-5">
      <AnimatePresence mode="wait">
        {!open && (
          <motion.button
            key="fab"
            type="button"
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            onClick={() => {
              setOpen(true)
              setMinimized(false)
            }}
            className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-cp-accent/30 bg-cp-surface/95 px-3 py-2.5 text-sm font-semibold text-cp-text shadow-[0_8px_32px_rgba(34,211,238,0.2)] backdrop-blur-md transition hover:border-cp-accent/50 sm:px-5 sm:py-3"
          >
            <img
              src={CONSULTANT_IMAGE}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-cp-accent/40"
            />
            <span className="hidden min-[380px]:inline">Tire suas dúvidas</span>
            <span className="min-[380px]:hidden">Dúvidas?</span>
          </motion.button>
        )}

        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              height: minimized ? 'auto' : 'min(520px, calc(100dvh - 6rem))',
            }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            className="pointer-events-auto flex w-full max-w-[400px] flex-col overflow-hidden rounded-2xl border border-cp-border/80 bg-cp-surface/95 shadow-[0_20px_60px_rgba(0,0,0,0.25)] backdrop-blur-xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-cp-border/60 bg-gradient-to-r from-cp-accent/15 via-cp-surface to-cp-surface px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <img
                  src={CONSULTANT_IMAGE}
                  alt="Consultora IA"
                  className="h-10 w-10 shrink-0 rounded-xl object-cover ring-2 ring-cp-accent/30"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-cp-text">Consultora IA</p>
                  <p className="flex items-center gap-1 text-[11px] text-cp-muted">
                    <Sparkles className="h-3 w-3 shrink-0 text-cp-accent" />
                    <span className="truncate">{subtitle}</span>
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setMinimized((v) => !v)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-cp-muted transition hover:bg-cp-bg hover:text-cp-text"
                  aria-label={minimized ? 'Expandir chat' : 'Minimizar chat'}
                >
                  {minimized ? <ChevronDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-cp-muted transition hover:bg-cp-bg hover:text-cp-text"
                  aria-label="Fechar chat"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {!minimized && (
              <>
                <div
                  ref={listRef}
                  className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
                  style={{ minHeight: 0 }}
                >
                  {messages.length <= 1 ? (
                    <div className="flex items-center justify-center overflow-hidden rounded-xl border border-cp-border/50 bg-gradient-to-br from-cp-accent/10 via-cp-bg/20 to-cp-bg/40 p-2">
                      <img
                        src={CONSULTANT_IMAGE}
                        alt="Estude com IA — Concurseiro Preditivo"
                        className="mx-auto h-auto max-h-36 w-full object-contain object-center"
                      />
                    </div>
                  ) : null}
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                          msg.role === 'user'
                            ? 'rounded-br-md bg-cp-accent text-white'
                            : 'rounded-bl-md border border-cp-border/60 bg-cp-bg/60 text-cp-text'
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex items-center gap-2 text-xs text-cp-muted">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Consultora digitando…
                    </div>
                  )}
                </div>

                <div className="border-t border-cp-border/60 bg-cp-surface/80 px-3 py-3">
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {quickPrompts.map((q) => (
                      <button
                        key={q}
                        type="button"
                        disabled={loading}
                        onClick={() => sendMessage(q)}
                        className="rounded-full border border-cp-border/70 bg-cp-bg/50 px-2.5 py-1 text-[11px] font-medium text-cp-muted transition hover:border-cp-accent/40 hover:text-cp-text disabled:opacity-50"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                  <form
                    className="flex items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      sendMessage(input)
                    }}
                  >
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT_CHARS))}
                      rows={1}
                      placeholder="Digite sua dúvida…"
                      maxLength={MAX_INPUT_CHARS}
                      className="max-h-24 min-h-[42px] flex-1 resize-none rounded-xl border border-cp-border bg-cp-bg/50 px-3 py-2.5 text-sm text-cp-text placeholder:text-cp-muted focus:border-cp-accent/50 focus:outline-none focus:ring-1 focus:ring-cp-accent/30"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          sendMessage(input)
                        }
                      }}
                    />
                    <button
                      type="submit"
                      disabled={loading || !input.trim()}
                      className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-cp-accent text-white transition hover:brightness-110 disabled:opacity-40"
                      aria-label="Enviar"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </form>
                  {checkoutHref ? (
                    <a
                      href={checkoutHref}
                      className="mt-2 block text-center text-[11px] font-semibold text-cp-accent hover:underline"
                    >
                      {variant === 'home' ? 'Ver cursos disponíveis →' : 'Ir para pagamento →'}
                    </a>
                  ) : null}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
