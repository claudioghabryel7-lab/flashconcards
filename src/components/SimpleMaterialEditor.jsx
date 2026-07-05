import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { stripHtml, textToSimpleHtml } from '../utils/htmlTextHelpers'

const inputClass =
  'w-full rounded-xl border border-cp-border bg-cp-bg/60 px-3 py-2 text-sm text-cp-text placeholder:text-cp-muted focus:border-cp-accent/40 focus:outline-none focus:ring-1 focus:ring-cp-accent/25'

const labelClass = 'font-mono text-[10px] uppercase tracking-wider text-cp-muted'

function SectionList({ title, items, onChange, addLabel }) {
  const updateItem = (idx, field, value) => {
    const next = items.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    onChange(next)
  }

  const addItem = () => onChange([...items, { titulo: '', conteudo: '' }])

  const removeItem = (idx) => onChange(items.filter((_, i) => i !== idx))

  return (
    <div className="cp-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className={labelClass}>{title}</p>
        <button type="button" onClick={addItem} className="cp-btn-ghost !px-2 !py-1 !text-[10px]">
          <PlusIcon className="h-3.5 w-3.5" />
          {addLabel}
        </button>
      </div>
      {items.length === 0 && (
        <p className="text-xs text-cp-muted">Nenhum item. Clique em adicionar.</p>
      )}
      {items.map((item, idx) => (
        <div key={idx} className="rounded-xl border border-cp-border/60 p-3 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={item.titulo || ''}
              onChange={(e) => updateItem(idx, 'titulo', e.target.value)}
              placeholder="Título"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => removeItem(idx)}
              className="shrink-0 rounded-lg border border-red-500/20 p-2 text-red-400 hover:bg-red-500/10"
              title="Remover"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
          <textarea
            value={item.conteudo || ''}
            onChange={(e) => updateItem(idx, 'conteudo', e.target.value)}
            placeholder="Conteúdo (texto simples — parágrafos separados por linha em branco)"
            rows={5}
            className={`${inputClass} resize-y min-h-[100px]`}
          />
        </div>
      ))}
    </div>
  )
}

/** Editor visual simplificado para material de apoio gerado pela IA */
const SimpleMaterialEditor = ({ draft, onChange, onSave, onCancel, saving = false }) => {
  const update = (patch) => onChange({ ...draft, ...patch })

  const raioX = draft.raioXProbabilidade || {}
  const topAssuntos = Array.isArray(raioX.topicosQuentes) ? raioX.topicosQuentes : []

  const revisaoTurbo = (draft.revisaoTurbo || []).map((r) => ({
    titulo: r.titulo || '',
    conteudo: stripHtml(r.conteudo || ''),
  }))

  const pegadinhas = (draft.pegadinhas || []).map((p) => ({
    titulo: p.titulo || '',
    conteudo: stripHtml(p.conteudo || ''),
  }))

  const secoes = (draft.secoes || []).map((s) => ({
    titulo: s.titulo || '',
    conteudo: stripHtml(s.conteudo || ''),
    tipo: s.tipo || '',
  }))

  const handleSave = () => {
    const payload = {
      ...draft,
      titulo: draft.titulo || '',
      subtitulo: draft.subtitulo || '',
      content: textToSimpleHtml(draft.contentPlain || ''),
      raioXProbabilidade: {
        ...raioX,
        topicosQuentes: topAssuntos.filter(Boolean),
        padraoBanca: textToSimpleHtml(draft.padraoBancaPlain || ''),
      },
      revisaoTurbo: revisaoTurbo
        .filter((r) => r.titulo || r.conteudo)
        .map((r) => ({ titulo: r.titulo, conteudo: textToSimpleHtml(r.conteudo) })),
      pegadinhas: pegadinhas
        .filter((p) => p.titulo || p.conteudo)
        .map((p) => ({ titulo: p.titulo, conteudo: textToSimpleHtml(p.conteudo) })),
      secoes: secoes
        .filter((s) => s.titulo || s.conteudo)
        .map((s) => ({
          titulo: s.titulo,
          tipo: s.tipo,
          conteudo: textToSimpleHtml(s.conteudo),
        })),
    }
    delete payload.contentPlain
    delete payload.padraoBancaPlain
    onSave(payload)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-cp-muted">
        Edite em texto simples — sem HTML. Parágrafos: linha em branco entre blocos.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Título</label>
          <input
            type="text"
            value={draft.titulo || ''}
            onChange={(e) => update({ titulo: e.target.value })}
            className={`${inputClass} mt-1`}
          />
        </div>
        <div>
          <label className={labelClass}>Subtítulo</label>
          <input
            type="text"
            value={draft.subtitulo || ''}
            onChange={(e) => update({ subtitulo: e.target.value })}
            className={`${inputClass} mt-1`}
          />
        </div>
      </div>

      <div className="cp-card p-4 space-y-3">
        <p className={labelClass}>Raio-X — top assuntos quentes</p>
        <textarea
          value={topAssuntos.join('\n')}
          onChange={(e) =>
            update({
              raioXProbabilidade: {
                ...raioX,
                topicosQuentes: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean),
              },
            })
          }
          placeholder="Um assunto por linha"
          rows={4}
          className={inputClass}
        />
        <div>
          <label className={labelClass}>Padrão da banca</label>
          <textarea
            value={draft.padraoBancaPlain ?? stripHtml(raioX.padraoBanca || '')}
            onChange={(e) => update({ padraoBancaPlain: e.target.value })}
            rows={4}
            className={`${inputClass} mt-1`}
          />
        </div>
      </div>

      <SectionList
        title="Revisão turbo"
        addLabel="Resumo"
        items={revisaoTurbo}
        onChange={(items) =>
          update({
            revisaoTurbo: items,
          })
        }
      />

      <SectionList
        title="Pegadinhas"
        addLabel="Pegadinha"
        items={pegadinhas}
        onChange={(items) => update({ pegadinhas: items })}
      />

      <SectionList
        title="Seções"
        addLabel="Seção"
        items={secoes}
        onChange={(items) => update({ secoes: items })}
      />

      <div className="cp-card p-4">
        <label className={labelClass}>Conteúdo principal</label>
        <textarea
          value={draft.contentPlain ?? stripHtml(draft.content || '')}
          onChange={(e) => update({ contentPlain: e.target.value })}
          rows={8}
          className={`${inputClass} mt-2 min-h-[160px]`}
        />
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <button type="button" onClick={handleSave} disabled={saving} className="cp-btn-primary">
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </button>
        <button type="button" onClick={onCancel} className="cp-btn-ghost">
          Cancelar
        </button>
      </div>
    </div>
  )
}

export default SimpleMaterialEditor
