import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AcademicCapIcon,
  ArrowDownTrayIcon,
  DocumentTextIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import { generateAiJson } from '../../utils/geminiApi'
import {
  buildConcursoDifficultyPrompt,
  buildConcursoMaterialPrompt,
} from '../../utils/concursoMaterialPrompt'
import { downloadElementAsPdf } from '../../utils/materialPdfExport'
import ContentPublishButton from '../ContentPublishButton'
import { defaultContentStatus, toggleContentStatus } from '../../utils/contentStatus'

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

export default function AdminConcursoMaterial({ courses = [] }) {
  const [form, setForm] = useState({
    courseId: courses[0]?.id || 'alego-default',
    concurso: '',
    cargo: '',
    banca: '',
    focoMateria: '',
  })
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState('')
  const [feedback, setFeedback] = useState('')
  const [preview, setPreview] = useState(null)
  const [savedMaterials, setSavedMaterials] = useState([])
  const previewRef = useRef(null)

  const courseId = form.courseId || 'alego-default'

  useEffect(() => {
    if (!courseId) return

    const q = query(
      collection(db, 'courses', courseId, 'materiaisConcurso'),
      orderBy('createdAt', 'desc'),
    )

    const unsub = onSnapshot(
      q,
      (snap) => {
        setSavedMaterials(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      },
      () => {
        getDocs(collection(db, 'courses', courseId, 'materiaisConcurso')).then((snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          items.sort((a, b) => {
            const da = a.createdAt?.toDate?.() || new Date(0)
            const dbDate = b.createdAt?.toDate?.() || new Date(0)
            return dbDate - da
          })
          setSavedMaterials(items)
        })
      },
    )

    return () => unsub()
  }, [courseId])

  const canGenerate = useMemo(
    () =>
      form.concurso.trim() &&
      form.cargo.trim() &&
      form.banca.trim() &&
      !generating,
    [form, generating],
  )

  const loadEditalExcerpt = async (selectedCourseId) => {
    const editalRef = doc(db, 'courses', selectedCourseId, 'prompts', 'edital')
    const editalDoc = await getDoc(editalRef)
    if (!editalDoc.exists()) return ''
    const data = editalDoc.data()
    return `${data.prompt || ''}\n\n${data.pdfText || ''}`.trim()
  }

  const handleGenerate = async () => {
    if (!canGenerate) return

    setGenerating(true)
    setProgress('')
    setFeedback('')
    setPreview(null)

    try {
      setProgress('📖 Buscando edital do curso (se houver)...')
      const editalExcerpt = await loadEditalExcerpt(courseId)

      setProgress('🧠 Analisando dificuldade do concurso, cargo e banca...')
      const analise = await generateAiJson(
        buildConcursoDifficultyPrompt({
          concurso: form.concurso.trim(),
          cargo: form.cargo.trim(),
          banca: form.banca.trim(),
          editalExcerpt,
        }),
        {
          courseId,
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
          editalExcerpt,
          focoMateria: form.focoMateria.trim(),
        }),
        {
          courseId,
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
        status: defaultContentStatus(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }

      setProgress('💾 Salvando material no curso...')
      await addDoc(collection(db, 'courses', courseId, 'materiaisConcurso'), payload)

      setPreview(payload)
      setFeedback('✅ Material gerado e salvo com sucesso!')
      setProgress('')
    } catch (err) {
      console.error(err)
      setFeedback(`❌ Erro: ${err.message}`)
      setProgress('')
    } finally {
      setGenerating(false)
    }
  }

  const handleToggleStatus = async (item) => {
    const next = toggleContentStatus(item.status)
    await updateDoc(doc(db, 'courses', courseId, 'materiaisConcurso', item.id), {
      status: next,
      updatedAt: serverTimestamp(),
    })
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
              Informe concurso, cargo e banca. A IA analisa a dificuldade e gera material completo e fiel.
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
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Curso destino</label>
              <select
                value={form.courseId}
                onChange={(e) => setForm({ ...form, courseId: e.target.value })}
                className="w-full rounded-xl border-2 border-slate-200 p-3 text-sm dark:border-slate-600 dark:bg-slate-700"
                disabled={generating}
              >
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </div>

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
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-lg font-bold">Pré-visualização</h3>
            {preview && (
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-slate-600"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                PDF
              </button>
            )}
          </div>

          <div
            ref={previewRef}
            className="max-h-[70vh] overflow-y-auto rounded-xl border border-slate-100 bg-white p-4 dark:border-slate-600 dark:bg-slate-900"
          >
            {preview ? renderMaterialPreview(preview) : (
              <p className="text-sm text-slate-500">O material gerado aparecerá aqui.</p>
            )}
          </div>
        </div>
      </div>

      {savedMaterials.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
          <h3 className="mb-4 text-lg font-bold">Materiais salvos neste curso</h3>
          <div className="space-y-2">
            {savedMaterials.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-600"
              >
                <button
                  type="button"
                  onClick={() => setPreview(item)}
                  className="text-left text-sm font-medium text-slate-700 hover:text-emerald-700 dark:text-slate-200"
                >
                  {item.titulo || `${item.concurso} — ${item.cargo}`}
                </button>
                <ContentPublishButton
                  status={item.status}
                  onToggle={() => handleToggleStatus(item)}
                  size="xs"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
