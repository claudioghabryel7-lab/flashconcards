import { useEffect, useState } from 'react'
import {
  PhotoIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { StarIcon } from '@heroicons/react/24/solid'
import {
  createMockReview,
  deleteMockReview,
  seedDefaultMockReviews,
  setMockReviewActive,
  setMockReviewsEnabled,
  subscribeMockReviews,
  subscribeMockReviewsConfig,
  updateMockReview,
  uploadMockReviewPhoto,
} from '../../services/mockReviewsService'

const emptyForm = {
  userName: '',
  comment: '',
  rating: 5,
  photoUrl: '',
  active: true,
}

export default function AdminMockReviews() {
  const [enabled, setEnabled] = useState(false)
  const [items, setItems] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    const unsubCfg = subscribeMockReviewsConfig((data) => {
      setEnabled(Boolean(data.enabled))
    })
    const unsubList = subscribeMockReviews(setItems)
    return () => {
      unsubCfg?.()
      unsubList?.()
    }
  }, [])

  const resetForm = () => {
    setForm(emptyForm)
    setEditingId(null)
  }

  const handleToggleMaster = async () => {
    if (busy) return
    setBusy(true)
    setFeedback('')
    try {
      await setMockReviewsEnabled(!enabled)
      setFeedback(
        !enabled
          ? '✅ Comentários mocados ativados na página inicial.'
          : '⏸️ Comentários mocados desativados na home.',
      )
    } catch (err) {
      setFeedback(`❌ ${err.message || 'Erro ao alterar.'}`)
    } finally {
      setBusy(false)
    }
  }

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setFeedback('')
    try {
      const url = await uploadMockReviewPhoto(file)
      setForm((prev) => ({ ...prev, photoUrl: url }))
    } catch (err) {
      setFeedback(`❌ ${err.message || 'Falha no upload da foto.'}`)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleSave = async () => {
    if (busy) return
    setBusy(true)
    setFeedback('')
    try {
      if (editingId) {
        await updateMockReview(editingId, {
          userName: form.userName.trim(),
          comment: form.comment.trim(),
          rating: form.rating,
          photoUrl: form.photoUrl,
          active: form.active,
        })
        setFeedback('✅ Comentário atualizado.')
      } else {
        await createMockReview(form)
        setFeedback('✅ Comentário mocado criado.')
      }
      resetForm()
    } catch (err) {
      setFeedback(`❌ ${err.message || 'Erro ao salvar.'}`)
    } finally {
      setBusy(false)
    }
  }

  const handleEdit = (item) => {
    setEditingId(item.id)
    setForm({
      userName: item.userName || '',
      comment: item.comment || '',
      rating: item.rating || 5,
      photoUrl: item.photoUrl || '',
      active: item.active !== false,
    })
  }

  const handleToggleItem = async (item) => {
    try {
      await setMockReviewActive(item.id, item.active === false)
    } catch (err) {
      setFeedback(`❌ ${err.message || 'Erro ao alternar.'}`)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Excluir este comentário mocado?')) return
    try {
      await deleteMockReview(id)
      if (editingId === id) resetForm()
    } catch (err) {
      setFeedback(`❌ ${err.message || 'Erro ao excluir.'}`)
    }
  }

  const handleSeed = async () => {
    if (busy) return
    if (
      !window.confirm(
        'Gerar 6 comentários de exemplo com foto?\n\nSó funciona se a lista estiver vazia.',
      )
    ) {
      return
    }
    setBusy(true)
    setFeedback('')
    try {
      await seedDefaultMockReviews()
      setFeedback('✅ Exemplos criados e exibição na home ativada.')
    } catch (err) {
      setFeedback(`❌ ${err.message || 'Erro ao gerar exemplos.'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-6 shadow-xl dark:border-violet-800 dark:from-violet-950/40 dark:to-fuchsia-950/20">
      <div className="relative space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-violet-800 dark:text-violet-200">
              <SparklesIcon className="h-5 w-5" />
              Comentários mocados (com foto)
            </p>
            <p className="mt-1 max-w-2xl text-xs text-violet-900/70 dark:text-violet-200/70">
              Crie depoimentos fictícios com foto. O interruptor geral controla se aparecem na
              página inicial junto das avaliações reais aprovadas. Cada item também pode ser
              ligado/desligado individualmente.
            </p>
          </div>
          <button
            type="button"
            onClick={handleToggleMaster}
            disabled={busy}
            className={`rounded-xl px-4 py-2 text-sm font-bold text-white shadow transition disabled:opacity-50 ${
              enabled
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-slate-500 hover:bg-slate-600'
            }`}
          >
            {enabled ? 'Exibição na home: ON' : 'Exibição na home: OFF'}
          </button>
        </div>

        {feedback && (
          <div className="rounded-xl border border-violet-200 bg-white/80 px-3 py-2 text-sm text-slate-800 dark:border-violet-700 dark:bg-slate-900/50 dark:text-slate-100">
            {feedback}
          </div>
        )}

        <div className="grid gap-4 rounded-2xl border border-violet-200/80 bg-white/70 p-4 dark:border-violet-800 dark:bg-slate-900/40 lg:grid-cols-[140px_1fr]">
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-violet-300 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/40">
              {form.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <PhotoIcon className="h-10 w-10 text-violet-400" />
              )}
            </div>
            <label className="cursor-pointer rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700">
              {uploading ? 'Enviando…' : 'Foto'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhoto}
                disabled={uploading || busy}
              />
            </label>
          </div>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Nome
                <input
                  type="text"
                  value={form.userName}
                  onChange={(e) => setForm({ ...form, userName: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  placeholder="Nome do aluno (mocado)"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Nota
                <select
                  value={form.rating}
                  onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                >
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} estrela{n > 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Comentário
              <textarea
                value={form.comment}
                onChange={(e) => setForm({ ...form, comment: e.target.value })}
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                placeholder="Depoimento que aparece na home…"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="rounded"
              />
              Ativo (pode aparecer na home quando o master estiver ON)
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={busy || uploading}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                <PlusIcon className="h-4 w-4" />
                {editingId ? 'Salvar edição' : 'Adicionar comentário'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
                >
                  Cancelar edição
                </button>
              )}
              <button
                type="button"
                onClick={handleSeed}
                disabled={busy || items.length > 0}
                className="rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-50 disabled:opacity-50 dark:border-violet-700 dark:bg-slate-900 dark:text-violet-200"
              >
                Gerar 6 exemplos
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-violet-900/70 dark:text-violet-200/70">
              Nenhum comentário mocado ainda. Crie um ou gere os exemplos.
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className={`flex flex-wrap items-start gap-4 rounded-xl border p-4 ${
                  item.active !== false
                    ? 'border-emerald-200 bg-white/90 dark:border-emerald-800 dark:bg-slate-900/50'
                    : 'border-slate-200 bg-slate-50/80 opacity-70 dark:border-slate-700 dark:bg-slate-900/30'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.photoUrl}
                  alt={item.userName}
                  className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-violet-200 dark:ring-violet-700"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900 dark:text-white">{item.userName}</p>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <StarIcon
                          key={star}
                          className={`h-3.5 w-3.5 ${
                            star <= (item.rating || 0) ? 'text-amber-400' : 'text-slate-300'
                          }`}
                        />
                      ))}
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        item.active !== false
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {item.active !== false ? 'Ativo' : 'Off'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{item.comment}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleItem(item)}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900"
                  >
                    {item.active !== false ? 'Desativar' : 'Ativar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEdit(item)}
                    className="rounded-lg bg-violet-100 px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-200"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="rounded-lg bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-200"
                  >
                    <TrashIcon className="inline h-3.5 w-3.5" /> Excluir
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
