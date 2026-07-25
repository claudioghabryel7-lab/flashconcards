'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore'
import { MessageCircle, Send, X } from 'lucide-react'
import { db, initFirebase, firebaseInitialized } from '@/firebase/config'
import { generateAiJson } from '@/utils/geminiApi'

type Msg = { role: 'user' | 'assistant'; text: string }

type CourseRow = {
  id: string
  name?: string
  competition?: string
  description?: string
  banca?: string
  price?: number
  originalPrice?: number
  monthlyPrice?: number
  monthlyEnabled?: boolean
  courseDuration?: string
  benefits?: string[] | string
  featured?: boolean
  active?: boolean
  imageUrl?: string
  imageBase64?: string
}

function formatMoney(v?: number) {
  if (v == null || Number.isNaN(Number(v))) return null
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function benefitsList(c: CourseRow) {
  if (Array.isArray(c.benefits)) return c.benefits.map(String).filter(Boolean)
  if (typeof c.benefits === 'string' && c.benefits.trim()) {
    return c.benefits
      .split(/\n|•|;/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return [
    'Edital verticalizado',
    'Questões preditivas no estilo da banca',
    'Flashcards e material por tópico',
    'Guia mentorado e trilha de estudos',
  ]
}

function buildCatalogBlock(courses: CourseRow[]) {
  if (!courses.length) return ''
  return courses
    .map((c, idx) => {
      const benefits = benefitsList(c).slice(0, 8).join('; ')
      const price = formatMoney(c.price) || 'consultar'
      const original = formatMoney(c.originalPrice)
      const monthly =
        c.monthlyEnabled === false
          ? ''
          : c.monthlyPrice != null
            ? ` | plano mensal ${formatMoney(c.monthlyPrice)}`
            : ''
      const desc = String(c.description || '').replace(/\s+/g, ' ').trim().slice(0, 280)
      return `${idx + 1}. ID=${c.id}
Nome: ${c.name || 'Curso'}
Concurso/cargo: ${c.competition || 'não informado'}
Banca: ${c.banca || 'não informada'}
Duração: ${c.courseDuration || 'não informada'}
Preço à vista: ${price}${original && c.originalPrice && c.originalPrice > (c.price || 0) ? ` (de ${original})` : ''}${monthly}
Descrição: ${desc || 'Curso completo no Concurseiro Preditivo'}
O que oferece: ${benefits}
Link de compra: /pagamento?course=${c.id}
Página do curso: /curso/${c.id}`
    })
    .join('\n\n')
}

async function loadActiveCourses(): Promise<CourseRow[]> {
  initFirebase()
  if (!firebaseInitialized || !db) return []

  try {
    const snap = await getDocs(query(collection(db, 'courses'), where('active', '==', true), limit(40)))
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as CourseRow[]
    if (list.length) return list
  } catch (err) {
    console.warn('[chatbot] query active courses falhou, fallback:', err)
  }

  // Fallback: lê todos e filtra no client (evita índice/permission edge cases)
  try {
    const snap = await getDocs(collection(db, 'courses'))
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as CourseRow)
      .filter((c) => c.active !== false)
      .slice(0, 40)
  } catch (err) {
    console.error('[chatbot] falha ao carregar cursos:', err)
    return []
  }
}

export default function HomeCourseChatbot() {
  const [open, setOpen] = useState(false)
  const [cfg, setCfg] = useState<{
    name?: string
    welcomeMessage?: string
    extraInfo?: string
    avatarUrl?: string
    avatarBase64?: string
  }>({})
  const [courses, setCourses] = useState<CourseRow[]>([])
  const [loadingCourses, setLoadingCourses] = useState(true)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const welcomeSent = useRef(false)

  const refreshCourses = useCallback(async () => {
    setLoadingCourses(true)
    const list = await loadActiveCourses()
    list.sort((a, b) => {
      if (a.featured && !b.featured) return -1
      if (!a.featured && b.featured) return 1
      return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')
    })
    setCourses(list)
    setLoadingCourses(false)
    return list
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      initFirebase()
      // Cursos SEMPRE separados do config (config exige auth em regras antigas)
      const list = await refreshCourses()
      if (cancelled) return

      try {
        if (firebaseInitialized && db) {
          const cfgSnap = await getDoc(doc(db, 'config', 'chatbot'))
          if (!cancelled && cfgSnap.exists()) setCfg(cfgSnap.data() || {})
        }
      } catch (err) {
        console.warn('[chatbot] config não lida (ok sem login):', err)
      }

      if (!cancelled && list.length === 0) {
        // segunda tentativa após init
        setTimeout(() => {
          if (!cancelled) void refreshCourses()
        }, 800)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshCourses])

  useEffect(() => {
    if (!open) return
    if (welcomeSent.current) return
    welcomeSent.current = true

    const names = courses
      .slice(0, 5)
      .map((c) => c.name)
      .filter(Boolean)
    const listTxt = names.length
      ? `Temos ${courses.length} curso(s) disponível(is), por exemplo: ${names.join(', ')}${courses.length > 5 ? '…' : ''}.`
      : loadingCourses
        ? 'Estou carregando os cursos do site…'
        : 'Estou buscando os cursos ativos do site.'

    const welcome =
      cfg.welcomeMessage ||
      `Olá! Sou o assistente do Concurseiro Preditivo. ${listTxt} Posso te contar o que cada um oferece, matérias/benefícios, valores (à vista e mensal) e te levar à compra. Qual concurso você quer?`

    setMessages([{ role: 'assistant', text: welcome }])
  }, [open, cfg.welcomeMessage, courses, loadingCourses])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  const avatar = cfg.avatarUrl || cfg.avatarBase64 || '/course-icons/logo.png'
  const botName = cfg.name || 'Assistente FlashCon'
  const catalog = useMemo(() => buildCatalogBlock(courses), [courses])

  const send = async (preset?: string) => {
    const text = (preset ?? input).trim()
    if (!text || busy) return
    if (!preset) setInput('')
    const next = [...messages, { role: 'user' as const, text }]
    setMessages(next)
    setBusy(true)
    try {
      let liveCourses = courses
      if (!liveCourses.length) {
        liveCourses = await refreshCourses()
      }
      const liveCatalog = buildCatalogBlock(liveCourses)

      const prompt = `Você é o vendedor consultivo (chatbot) do Concurseiro Preditivo / FlashConCards.
Objetivo: PERSUADIR com honestidade a pessoa a comprar o curso certo, usando APENAS o catálogo abaixo.

REGRAS OBRIGATÓRIAS:
1. Se o catálogo tiver cursos, NUNCA diga que não há cursos disponíveis.
2. Fale dos cursos REAIS: nome, concurso/cargo, banca, o que oferece (benefícios), descrição, preço à vista e mensal se houver.
3. Cite o link de compra no formato /pagamento?course=ID (use o ID exato do catálogo).
4. Se perguntarem "quais cursos tem?", liste os disponíveis com preço.
5. Se perguntarem de um curso específico, detalhe benefícios/matérias cobertas pelo que está no catálogo e convide a comprar.
6. Seja persuasivo, curto (máx ~120 palavras), em português do Brasil, tom humano.
7. Não invente preço, banca ou benefício fora do catálogo. Se faltar dado, diga o que há e foque no restante.
8. Informações extras do admin (use se ajudarem a vender):
${cfg.extraInfo || '(nenhuma)'}

CATÁLOGO AO VIVO DO SITE (${liveCourses.length} curso(s)):
${liveCatalog || 'ERRO TEMPORÁRIO: catálogo vazio — peça para a pessoa abrir /cursos e diga que já já carrega.'}

Histórico (últimas 6 mensagens):
${next
  .slice(-6)
  .map((m) => `${m.role === 'user' ? 'Usuário' : 'Bot'}: ${m.text.slice(0, 400)}`)
  .join('\n')}

Responda APENAS JSON válido:
{ "reply": "texto da resposta" }`

      const parsed = await generateAiJson(prompt, {
        trustedGeneration: true,
        useGoogleSearch: false,
        verifyContent: false,
        useRAG: false,
        thinkingLevel: 'minimal',
        purpose: 'chatbot',
        generationConfig: { maxOutputTokens: 400, temperature: 0.35 },
      })
      let reply = String(parsed?.reply || parsed?.text || '').trim()

      if (!reply && liveCourses.length) {
        const top = liveCourses.slice(0, 3)
        reply = `Temos ${liveCourses.length} curso(s) no ar. Destaques: ${top
          .map((c) => `${c.name} (${formatMoney(c.price) || 'consultar'})`)
          .join('; ')}. Quer que eu detalhe algum?`
      }
      if (!reply) {
        reply = 'Veja os cursos em /cursos — posso te orientar na compra pelo link /pagamento?course=ID.'
      }

      // Blindagem: se a IA mentir que não há curso, corrige
      if (
        liveCourses.length > 0 &&
        /n[aã]o (h[aá]|tem|existem?).{0,40}curso|sem cursos? dispon/i.test(reply)
      ) {
        const top = liveCourses.slice(0, 4)
        reply = `Sim, temos cursos disponíveis agora: ${top
          .map((c) => `${c.name} — ${formatMoney(c.price) || 'consultar'}`)
          .join('; ')}. Qual concurso você quer? Posso detalhar o conteúdo e te mandar o link de compra.`
      }

      setMessages((m) => [...m, { role: 'assistant', text: reply }])
    } catch (err) {
      console.error('[chatbot] send:', err)
      const fallback =
        courses.length > 0
          ? `No momento a IA travou, mas os cursos estão no ar. Exemplos: ${courses
              .slice(0, 3)
              .map((c) => c.name)
              .join(', ')}. Abra /cursos ou me diga o concurso que você busca.`
          : 'Tive um problema agora. Veja /cursos ou fale com o suporte no WhatsApp.'
      setMessages((m) => [...m, { role: 'assistant', text: fallback }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          if (!courses.length) void refreshCourses()
        }}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full border border-cp-accent/40 bg-cp-surface px-4 py-3 text-sm font-semibold text-cp-text shadow-lg hover:border-cp-accent"
        aria-label="Abrir chat sobre cursos"
      >
        <img src={avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
        <span className="hidden sm:inline">Falar dos cursos</span>
        <MessageCircle className="h-4 w-4 text-cp-accent sm:hidden" />
      </button>

      {open && (
        <div className="fixed bottom-5 right-5 z-50 flex h-[min(72vh,560px)] w-[min(100vw-1.5rem,400px)] flex-col overflow-hidden rounded-2xl border border-cp-border bg-cp-surface shadow-2xl">
          <div className="flex items-center gap-3 border-b border-cp-border bg-cp-bg/80 px-3 py-2.5">
            <img src={avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-cp-text">{botName}</p>
              <p className="text-[11px] text-cp-muted">
                {loadingCourses
                  ? 'Carregando cursos…'
                  : courses.length
                    ? `${courses.length} curso(s) disponíveis`
                    : 'Buscando cursos do site…'}
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-cp-bg" aria-label="Fechar">
              <X className="h-4 w-4 text-cp-muted" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.map((m, i) => (
              <div
                key={`${i}-${m.role}`}
                className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === 'user' ? 'ml-auto bg-cp-accent/20 text-cp-text' : 'bg-cp-bg text-cp-text/95'
                }`}
              >
                {m.text}
              </div>
            ))}
            {busy && <p className="text-xs text-cp-muted">Digitando…</p>}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-cp-border p-2">
            <div className="mb-2 flex max-h-16 flex-wrap gap-1.5 overflow-y-auto px-1">
              <button
                type="button"
                className="rounded-full border border-cp-border px-2.5 py-1 text-[10px] text-cp-muted hover:text-cp-accent"
                onClick={() => void send('Quais cursos estão disponíveis agora? Me fale os preços.')}
              >
                Quais cursos tem?
              </button>
              {courses.slice(0, 4).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="max-w-[140px] truncate rounded-full border border-cp-accent/30 bg-cp-accent/10 px-2.5 py-1 text-[10px] text-cp-accent"
                  onClick={() =>
                    void send(
                      `Me explique o curso "${c.name}" (id ${c.id}): o que oferece, banca, valor à vista e mensal, e por que comprar.`,
                    )
                  }
                >
                  {c.name}
                </button>
              ))}
              <Link
                href="/cursos"
                className="rounded-full border border-cp-border px-2.5 py-1 text-[10px] text-cp-muted hover:text-cp-accent"
              >
                Ver todos
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
                placeholder="Ex.: o que tem no curso da ALEGO? quanto custa?"
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
            {!catalog && !loadingCourses && (
              <p className="mt-1 px-1 text-[10px] text-amber-500">
                Catálogo ainda vazio — toque em “Quais cursos tem?” para recarregar.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
