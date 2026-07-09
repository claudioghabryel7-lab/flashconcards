import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AcademicCapIcon,
  ArrowDownTrayIcon,
  ClockIcon,
  DocumentTextIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { generateAiJson } from '../../utils/geminiApi'
import {
  buildConcursoDifficultyPrompt,
  buildConcursoMaterialPrompt,
} from '../../utils/concursoMaterialPrompt'
import { downloadElementAsPdf } from '../../utils/materialPdfExport'

const TEMP_MATERIAL_TTL_MS = 15 * 60 * 1000
const SESSION_STORAGE_KEY = 'admin_temp_concurso_material'

function renderMaterialPreview(material) {
  if (!material) return null

  return (
    <div className="space-y-6 text-slate-800">
      <header>
        <h2 className="text-2xl font-black">{material.titulo}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {material.concurso} · {material.cargo} · Banca {material.banca}
        </p>
        {material.analiseDificuldade?.justificativa && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <strong>Dificuldade ({material.analiseDificuldade.nivelDificuldade}):</strong>{' '}
            {material.analiseDificuldade.justificativa}
          </p>
        )}
      </header>

      {material.raioXProbabilidade && (
        <section>
          <h3 className="mb-2 text-lg font-bold">Raio-X de Probabilidade</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {(material.raioXProbabilidade.topicosQuentes || []).map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          {material.raioXProbabilidade.padraoBanca && (
            <p className="mt-3 text-sm">{material.raioXProbabilidade.padraoBanca}</p>
          )}
        </section>
      )}

      {(material.revisaoTurbo || []).map((item, idx) => (
        <section key={`${item.titulo}-${idx}`}>
          <h3 className="mb-2 text-lg font-bold">{item.titulo}</h3>
          <div
            className="prose prose-sm max-w-none text-slate-700"
            dangerouslySetInnerHTML={{ __html: item.conteudo || '' }}
          />
        </section>
      ))}

      {(material.pegadinhas || []).map((item, idx) => (
        <section key={`peg-${idx}`} className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <h3 className="mb-2 font-bold text-rose-800">{item.titulo}</h3>
          <div
            className="prose prose-sm max-w-none text-rose-900"
            dangerouslySetInnerHTML={{ __html: item.conteudo || '' }}
          />
        </section>
      ))}

      {(material.questoesPreditivas || []).map((q, idx) => (
        <section key={`q-${idx}`} className="rounded-xl border border-slate-200 p-4">
          <p className="font-semibold">
            {idx + 1}. {q.enunciado}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {Object.entries(q.alternativas || {}).map(([letter, text]) => (
              <li key={letter}>
                <strong>{letter})</strong> {text}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm">
            <strong>Gabarito {q.correta}:</strong> {q.gabaritoComentado}
          </p>
        </section>
      ))}
    </div>
  )
}

function formatRemainingTime(expiresAt) {
  const remainingMs = Math.max(0, expiresAt - Date.now())
  const minutes = Math.floor(remainingMs / 60000)
  const seconds = Math.floor((remainingMs % 60000) / 1000)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function readStoredMaterial() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.material || !parsed?.expiresAt) return null
    if (Date.now() >= parsed.expiresAt) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }
}

function persistMaterial(material, expiresAt) {
  sessionStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ material, expiresAt }),
  )
}

function clearStoredMaterial() {
  sessionStorage.removeItem(SESSION_STORAGE_KEY)
}

export default function AdminConcursoMaterial() {
  const [form, setForm] = useState({
    concurso: '',
    cargo: '',
    banca: '',
    focoMateria: '',
  })
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState('')
  const [feedback, setFeedback] = useState('')
  const [preview, setPreview] = useState(null)
  const [expiresAt, setExpiresAt] = useState(null)
  const [remainingLabel, setRemainingLabel] = useState('')
  const previewRef = useRef(null)
  const expiryTimerRef = useRef(null)

  const clearTemporaryMaterial = useCallback((message = '') => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current)
      expiryTimerRef.current = null
    }
    clearStoredMaterial()
    setPreview(null)
    setExpiresAt(null)
    setRemainingLabel('')
    if (message) setFeedback(message)
  }, [])

  const scheduleExpiry = useCallback(
    (targetExpiresAt) => {
      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current)

      const remainingMs = Math.max(0, targetExpiresAt - Date.now())
      expiryTimerRef.current = setTimeout(() => {
        clearTemporaryMaterial(
          '⏱️ O material expirou e foi removido do sistema. Gere novamente se precisar.',
        )
      }, remainingMs)
    },
    [clearTemporaryMaterial],
  )

  useEffect(() => {
    const stored = readStoredMaterial()
    if (!stored) return

    setPreview(stored.material)
    setExpiresAt(stored.expiresAt)
    setFeedback('Material temporário restaurado. Baixe o PDF antes que expire.')
    scheduleExpiry(stored.expiresAt)
  }, [scheduleExpiry])

  useEffect(() => {
    if (!expiresAt) return undefined

    const tick = () => setRemainingLabel(formatRemainingTime(expiresAt))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  useEffect(
    () => () => {
      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current)
    },
    [],
  )

  const canGenerate = useMemo(
    () => form.concurso.trim() && form.cargo.trim() && form.banca.trim() && !generating,
    [form, generating],
  )

  const handleGenerate = async () => {
    if (!canGenerate) return

    clearTemporaryMaterial()
    setGenerating(true)
    setProgress('')
    setFeedback('')

    try {
      setProgress('🧠 Analisando dificuldade do concurso, cargo e banca...')
      const analise = await generateAiJson(
        buildConcursoDifficultyPrompt({
          concurso: form.concurso.trim(),
          cargo: form.cargo.trim(),
          banca: form.banca.trim(),
        }),
        {
          generationConfig: { maxOutputTokens: 8000, temperature: 0.3 },
        },
      )

      setProgress('✍️ Gerando material completo calibrado pela análise de dificuldade...')
      const material = await generateAiJson(
        buildConcursoMaterialPrompt({
          concurso: form.concurso.trim(),
          cargo: form.cargo.trim(),
          banca: form.banca.trim(),
          analiseDificuldade: analise,
          focoMateria: form.focoMateria.trim(),
        }),
        {
          isLegalContent: true,
          useRAG: true,
          generationConfig: { maxOutputTokens: 32000, temperature: 0.35 },
        },
      )

      const payload = {
        ...material,
        concurso: form.concurso.trim(),
        cargo: form.cargo.trim(),
        banca: form.banca.trim(),
        focoMateria: form.focoMateria.trim() || null,
        analiseDificuldade: material.analiseDificuldade || analise,
        generatedAt: Date.now(),
      }

      const nextExpiresAt = Date.now() + TEMP_MATERIAL_TTL_MS
      persistMaterial(payload, nextExpiresAt)
      setPreview(payload)
      setExpiresAt(nextExpiresAt)
      scheduleExpiry(nextExpiresAt)
      setFeedback(
        '✅ Material gerado! Baixe o PDF em até 15 minutos — depois disso será apagado automaticamente.',
      )
      setProgress('')
    } catch (err) {
      console.error(err)
      setFeedback(`❌ Erro: ${err.message}`)
      setProgress('')
    } finally {
      setGenerating(false)
    }
  }

  const handleDownloadPdf = async () => {
    if (!previewRef.current || !preview) return
    const fileName = `${preview.concurso || 'material'}-${preview.cargo || 'cargo'}.pdf`
    await downloadElementAsPdf(previewRef.current, fileName)
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-6 dark:border-emerald-800 dark:from-emerald-900/20 dark:to-teal-900/20">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 p-3">
            <AcademicCapIcon className="h-7 w-7 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-emerald-800 dark:text-emerald-200">
              Material por Concurso
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Informe concurso, cargo e banca. A IA analisa a dificuldade, gera o material na
              pré-visualização e você baixa o PDF. O conteúdo expira em 15 minutos.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold">
            <SparklesIcon className="h-5 w-5 text-emerald-600" />
            Configuração
          </h3>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Concurso</label>
              <input
                value={form.concurso}
                onChange={(e) => setForm({ ...form, concurso: e.target.value })}
                placeholder="Ex: PM-GO 2026"
                className="w-full rounded-xl border-2 border-slate-200 p-3 text-sm dark:border-slate-600 dark:bg-slate-700"
                disabled={generating}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Cargo</label>
              <input
                value={form.cargo}
                onChange={(e) => setForm({ ...form, cargo: e.target.value })}
                placeholder="Ex: Soldado PM"
                className="w-full rounded-xl border-2 border-slate-200 p-3 text-sm dark:border-slate-600 dark:bg-slate-700"
                disabled={generating}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Banca</label>
              <input
                value={form.banca}
                onChange={(e) => setForm({ ...form, banca: e.target.value })}
                placeholder="Ex: Instituto AOCP, FGV, CEBRASPE..."
                className="w-full rounded-xl border-2 border-slate-200 p-3 text-sm dark:border-slate-600 dark:bg-slate-700"
                disabled={generating}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Foco opcional (matéria/disciplina)
              </label>
              <input
                value={form.focoMateria}
                onChange={(e) => setForm({ ...form, focoMateria: e.target.value })}
                placeholder="Ex: Direito Constitucional — deixe vazio para visão geral"
                className="w-full rounded-xl border-2 border-slate-200 p-3 text-sm dark:border-slate-600 dark:bg-slate-700"
                disabled={generating}
              />
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 py-3 font-bold text-white disabled:opacity-50"
            >
              {generating ? (
                <>
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Gerando...
                </>
              ) : (
                <>
                  <DocumentTextIcon className="h-5 w-5" />
                  Gerar material com IA
                </>
              )}
            </button>

            {progress && (
              <p className="whitespace-pre-line rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
                {progress}
              </p>
            )}
            {feedback && (
              <p className="rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-700">{feedback}</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-bold">Pré-visualização</h3>
            <div className="flex items-center gap-2">
              {preview && expiresAt && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                  <ClockIcon className="h-4 w-4" />
                  Expira em {remainingLabel}
                </span>
              )}
              {preview && (
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-slate-600"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  Baixar PDF
                </button>
              )}
            </div>
          </div>

          <div
            ref={previewRef}
            className="max-h-[70vh] overflow-y-auto rounded-xl border border-slate-100 bg-white p-4 dark:border-slate-600 dark:bg-slate-900"
          >
            {preview ? (
              renderMaterialPreview(preview)
            ) : (
              <p className="text-sm text-slate-500">
                O material gerado aparecerá aqui por 15 minutos. Baixe o PDF antes que expire.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
