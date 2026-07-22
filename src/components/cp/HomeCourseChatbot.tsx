'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { doc, getDoc, collection, getDocs, query, where, limit } from 'firebase/firestore'
import { MessageCircle, Send, X } from 'lucide-react'
import { db, initFirebase, firebaseInitialized } from '@/firebase/config'
import { generateAiJson } from '@/utils/geminiApi'

type Msg = { role: 'user' | 'assistant'; text: string }

export default function HomeCourseChatbot() {
  const [open, setOpen] = useState(false)
  const [cfg, setCfg] = useState<{
    name?: string
    welcomeMessage?: string
    extraInfo?: string
    avatarUrl?: string
    avatarBase64?: string
  }>({})
  const [courses, setCourses] = useState<Array<Record<string, unknown>>>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      initFirebase()
      if (!firebaseInitialized || !db) return
      try {
        const [cfgSnap, coursesSnap] = await Promise.all([
          getDoc(doc(db, 'config', 'chatbot')),
          getDocs(query(collection(db, 'courses'), where('active', '==', true), limit(20))),
        ])
        if (cancelled) return
        if (cfgSnap.exists()) setCfg(cfgSnap.data() || {})
        setCourses(coursesSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!open) return
    if (messages.length) return
    const welcome =
      cfg.welcomeMessage ||
      'Olá! Posso te ajudar a escolher um curso: o que cada um oferece, valores e como estudar. Qual concurso você busca?'
    setMessages([{ role: 'assistant', text: welcome }])
  }, [open, cfg.welcomeMessage, messages.length])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  const avatar = cfg.avatarUrl || cfg.avatarBase64 || '/course-icons/logo.png'
  const botName = cfg.name || 'Assistente FlashCon'

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    const next = [...messages, { role: 'user' as const, text }]
    setMessages(next)
    setBusy(true)
    try {
      const catalog = courses
        .map((c) => {
          const price = c.price != null ? `R$ ${Number(c.price).toFixed(2)}` : 'consultar'
          const monthly = c.monthlyPrice != null ? ` | mensal R$ ${Number(c.monthlyPrice).toFixed(2)}` : ''
          return `- ${c.name} (${c.competition || 'concurso'}): ${String(c.description || '').slice(0, 180)} | à vista ${price}${monthly} | id=${c.id}`
        })
        .join('\n')

      const prompt = `Você é o chatbot comercial do Concurseiro Preditivo (FlashConCards).
Fale em português, curto e claro. Ajude a pessoa a entender os cursos e o que oferecem.
Não invente preço fora da lista. Incentive o link /pagamento?course=ID quando fizer sentido.
Informações extras do admin:
${cfg.extraInfo || '(nenhuma)'}

Catálogo:
${catalog || '(sem cursos ativos no momento)'}

Histórico:
${next.map((m) => `${m.role === 'user' ? 'Usuário' : 'Bot'}: ${m.text}`).join('\n')}

Responda APENAS JSON: { "reply": "texto da resposta" }`

      const parsed = await generateAiJson(prompt, {
        trustedGeneration: true,
        useGoogleSearch: false,
        verifyContent: false,
        generationConfig: { maxOutputTokens: 800, temperature: 0.4 },
      })
      const reply = String(parsed?.reply || parsed?.text || '').trim() ||
        'Posso te mostrar os cursos em /cursos. Qual área você estuda?'
      setMessages((m) => [...m, { role: 'assistant', text: reply }])
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: 'Tive um problema agora. Veja os cursos em /cursos ou fale com o suporte no WhatsApp.',
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full border border-cp-accent/40 bg-cp-surface px-4 py-3 text-sm font-semibold text-cp-text shadow-lg hover:border-cp-accent"
        aria-label="Abrir chat sobre cursos"
      >
        <img src={avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
        <span className="hidden sm:inline">Falar dos cursos</span>
        <MessageCircle className="h-4 w-4 text-cp-accent sm:hidden" />
      </button>

      {open && (
        <div className="fixed bottom-5 right-5 z-50 flex h-[min(70vh,520px)] w-[min(100vw-1.5rem,380px)] flex-col overflow-hidden rounded-2xl border border-cp-border bg-cp-surface shadow-2xl">
          <div className="flex items-center gap-3 border-b border-cp-border bg-cp-bg/80 px-3 py-2.5">
            <img src={avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-cp-text">{botName}</p>
              <p className="text-[11px] text-cp-muted">Tire dúvidas sobre cursos e planos</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-cp-bg" aria-label="Fechar">
              <X className="h-4 w-4 text-cp-muted" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.map((m, i) => (
              <div
                key={`${i}-${m.role}`}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'ml-auto bg-cp-accent/20 text-cp-text'
                    : 'bg-cp-bg text-cp-text/95'
                }`}
              >
                {m.text}
              </div>
            ))}
            {busy && <p className="text-xs text-cp-muted">Digitando…</p>}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-cp-border p-2">
            <div className="mb-2 flex gap-2 px-1">
              <Link href="/cursos" className="rounded-full border border-cp-border px-2.5 py-1 text-[10px] text-cp-muted hover:text-cp-accent">
                Ver cursos
              </Link>
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void send()
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ex.: o que tem no curso da ALEGO?"
                className="flex-1 rounded-xl border border-cp-border bg-cp-bg px-3 py-2 text-sm text-cp-text"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="rounded-xl bg-cp-accent px-3 text-cp-bg disabled:opacity-50"
                aria-label="Enviar"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
