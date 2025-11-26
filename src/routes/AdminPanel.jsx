import { useEffect, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore'
import { DocumentTextIcon, TrashIcon } from '@heroicons/react/24/outline'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'

const blankCard = {
  pergunta: '',
  resposta: '',
  explicacao: '',
  referencia: '',
  categoria: '',
  tags: '',
}

const AdminPanel = () => {
  const { isAdmin } = useAuth()
  const [cards, setCards] = useState([])
  const [jsonInput, setJsonInput] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(blankCard)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const cardsRef = collection(db, 'flashcards')
    const unsub = onSnapshot(cardsRef, (snapshot) => {
      const data = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }))
      setCards(data)
    })
    return () => unsub()
  }, [])

  const normalizeTags = (tags) => {
    if (Array.isArray(tags)) return tags
    if (!tags) return []
    return String(tags)
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
  }

  const handleImport = async () => {
    try {
      const parsed = JSON.parse(jsonInput)
      const list = Array.isArray(parsed) ? parsed : [parsed]
      const cardsRef = collection(db, 'flashcards')
      await Promise.all(
        list.map((card) =>
          addDoc(cardsRef, {
            ...card,
            tags: normalizeTags(card.tags),
          }),
        ),
      )
      setJsonInput('')
      setMessage('Flashcards importados com sucesso!')
    } catch (err) {
      setMessage('JSON inválido. Verifique a estrutura.')
    }
  }

  const startEdit = (card) => {
    setEditingId(card.id)
    setForm({
      pergunta: card.pergunta,
      resposta: card.resposta,
      explicacao: card.explicacao,
      referencia: card.referencia,
      categoria: card.categoria,
      tags: (card.tags || []).join(', '),
    })
  }

  const saveCard = async () => {
    if (!editingId) return
    const cardRef = doc(db, 'flashcards', editingId)
    await updateDoc(cardRef, {
      ...form,
      tags: form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    })
    setEditingId(null)
    setForm(blankCard)
    setMessage('Card atualizado!')
  }

  const removeCard = async (cardId) => {
    if (!window.confirm('Deseja realmente excluir este card?')) return
    await deleteDoc(doc(db, 'flashcards', cardId))
    setMessage('Card removido.')
  }

  if (!isAdmin) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-semibold text-alego-600">
          Acesso restrito à coordenação da mentoria.
        </p>
      </div>
    )
  }

  return (
    <section className="space-y-8">
      <div className="rounded-2xl bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-alego-500">
          Painel administrativo
        </p>
        <h1 className="mt-2 text-3xl font-bold text-alego-700">
          Importe, edite e organize os flashcards oficiais.
        </h1>
      </div>

      {message && (
        <div className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-600">
          {message}
        </div>
      )}

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-semibold text-alego-600">
          <DocumentTextIcon className="h-5 w-5" />
          Importar via JSON
        </p>
        <textarea
          value={jsonInput}
          onChange={(event) => setJsonInput(event.target.value)}
          rows={6}
          className="mt-3 w-full rounded-2xl border border-slate-200 p-4 text-sm focus:border-alego-400 focus:outline-none"
          placeholder='[{"pergunta":"...","resposta":"..."}]'
        />
        <button
          type="button"
          onClick={handleImport}
          className="mt-4 rounded-full bg-alego-600 px-6 py-2 text-sm font-semibold text-white"
        >
          Importar flashcards
        </button>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-alego-600">
          {cards.length} cards cadastrados
        </p>
        <div className="mt-4 divide-y divide-slate-100">
          {cards.map((card) => (
            <div
              key={card.id}
              className="flex flex-col gap-2 py-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-semibold text-alego-700">{card.pergunta}</p>
                <p className="text-sm text-slate-500">{card.categoria}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(card)}
                  className="rounded-full border border-alego-600 px-4 py-2 text-sm font-semibold text-alego-600"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => removeCard(card.id)}
                  className="flex items-center gap-1 rounded-full border border-rose-500 px-4 py-2 text-sm font-semibold text-rose-500"
                >
                  <TrashIcon className="h-4 w-4" />
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingId && (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-alego-600">
            Editando card selecionado
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {['pergunta', 'resposta', 'explicacao', 'referencia', 'categoria'].map(
              (field) => (
                <label key={field} className="text-xs font-semibold uppercase text-slate-500">
                  {field}
                  <input
                    type="text"
                    value={form[field]}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, [field]: event.target.value }))
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-alego-400 focus:outline-none"
                  />
                </label>
              ),
            )}
          </div>
          <label className="mt-4 block text-xs font-semibold uppercase text-slate-500">
            Tags (separadas por vírgula)
            <input
              type="text"
              value={form.tags}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, tags: event.target.value }))
              }
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-alego-400 focus:outline-none"
            />
          </label>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={saveCard}
              className="rounded-full bg-alego-600 px-6 py-2 text-sm font-semibold text-white"
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingId(null)
                setForm(blankCard)
              }}
              className="rounded-full border border-slate-300 px-6 py-2 text-sm font-semibold text-slate-500"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

export default AdminPanel

