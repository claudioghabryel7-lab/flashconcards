import { useMemo, useState } from 'react'
import {
  EnvelopeIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  SparklesIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'
import { sendAdminBroadcastEmail } from '../../utils/adminApi'
import { generateAiJson } from '../../utils/geminiApi'
import { buildAiEmailPrompt, buildEmailPreviewModel } from '../../utils/adminEmailAi'
import EmailDesignPreview from './EmailDesignPreview'
import { SITE_URL } from '../../lib/site'

const COMPOSE_MODES = [
  { id: 'manual', label: 'Manual', icon: PencilSquareIcon },
  { id: 'ai', label: 'Com IA', icon: SparklesIcon },
]

const RECIPIENT_MODES = [
  { id: 'one', label: 'Um usuário' },
  { id: 'selected', label: 'Vários selecionados' },
  { id: 'all', label: 'Todos os usuários' },
]

const EMPTY_BULLETS = ''

function bulletsToText(bullets = []) {
  return bullets.join('\n')
}

function textToBullets(text = '') {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export default function AdminEmailBroadcast({ users = [] }) {
  const [composeMode, setComposeMode] = useState('manual')
  const [recipientMode, setRecipientMode] = useState('one')
  const [selectedEmails, setSelectedEmails] = useState([])
  const [singleEmail, setSingleEmail] = useState('')
  const [aiBrief, setAiBrief] = useState('')
  const [subject, setSubject] = useState('')
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [message, setMessage] = useState('')
  const [highlight, setHighlight] = useState('')
  const [bulletsText, setBulletsText] = useState(EMPTY_BULLETS)
  const [ctaLabel, setCtaLabel] = useState('')
  const [ctaUrl, setCtaUrl] = useState(`${SITE_URL}/dashboard`)
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [showEditor, setShowEditor] = useState(false)

  const eligibleUsers = useMemo(
    () =>
      users.filter(
        (user) =>
          user.email &&
          !user.deleted &&
          user.role !== 'admin',
      ),
    [users],
  )

  const previewModel = useMemo(
    () =>
      buildEmailPreviewModel({
        title,
        subtitle,
        message,
        highlight,
        bullets: textToBullets(bulletsText),
        ctaLabel,
        ctaUrl,
      }),
    [title, subtitle, message, highlight, bulletsText, ctaLabel, ctaUrl],
  )

  const toggleEmail = (email) => {
    setSelectedEmails((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email],
    )
  }

  const resolveRecipients = () => {
    if (recipientMode === 'all') return []
    if (recipientMode === 'one') {
      const email = singleEmail?.trim()
      return email ? [email.toLowerCase()] : []
    }
    return selectedEmails.filter(Boolean).map((email) => email.toLowerCase())
  }

  const applyAiResult = (result) => {
    setSubject(result.subject || '')
    setTitle(result.title || '')
    setSubtitle(result.subtitle || '')
    setMessage(result.message || '')
    setHighlight(result.highlight || '')
    setBulletsText(bulletsToText(Array.isArray(result.bullets) ? result.bullets : []))
    setCtaLabel(result.ctaLabel || '')
    setCtaUrl(result.ctaUrl || `${SITE_URL}/dashboard`)
    setShowEditor(true)
  }

  const handleGenerateWithAi = async () => {
    if (!aiBrief.trim()) {
      setFeedback('❌ Descreva o que você quer comunicar no email.')
      return
    }

    setFeedback('')
    setGenerating(true)
    try {
      const result = await generateAiJson(buildAiEmailPrompt(aiBrief))
      applyAiResult(result)
      setFeedback('✅ Email gerado! Revise a pré-visualização e edite o que quiser antes de enviar.')
    } catch (err) {
      setFeedback(`❌ ${err.message || 'Erro ao gerar email com IA.'}`)
    } finally {
      setGenerating(false)
    }
  }

  const handleSend = async () => {
    setFeedback('')
    const recipients = resolveRecipients()

    if (recipientMode !== 'all' && !recipients.filter(Boolean).length) {
      setFeedback('❌ Selecione pelo menos um destinatário.')
      return
    }
    if (!subject.trim() || !title.trim() || !message.trim()) {
      setFeedback('❌ Preencha assunto, título e mensagem.')
      return
    }

    const totalLabel =
      recipientMode === 'all'
        ? `todos os ${eligibleUsers.length} usuários`
        : `${recipients.length} destinatário(s)`

    if (!window.confirm(`Enviar este email para ${totalLabel}?`)) return

    setSending(true)
    try {
      const result = await sendAdminBroadcastEmail({
        subject: subject.trim(),
        title: title.trim(),
        subtitle: subtitle.trim(),
        message: message.trim(),
        highlight: highlight.trim(),
        bullets: textToBullets(bulletsText),
        recipientMode,
        recipients,
        ctaLabel: ctaLabel.trim(),
        ctaUrl: ctaUrl.trim(),
      })

      setFeedback(
        result.errorSummary
          ? `❌ ${result.errorSummary}`
          : result.failed > 0
            ? `⚠️ Enviados: ${result.sent} · Falhas: ${result.failed} (de ${result.total})`
            : `✅ Email enviado para ${result.sent} destinatário(s)!`,
      )
    } catch (err) {
      setFeedback(`❌ ${err.message || 'Erro ao enviar emails.'}`)
    } finally {
      setSending(false)
    }
  }

  const showForm = composeMode === 'manual' || showEditor || title || message

  const recipientSection = (
    <>
      <div className="flex flex-wrap gap-2">
        {RECIPIENT_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => setRecipientMode(mode.id)}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
              recipientMode === mode.id
                ? 'bg-alego-600 text-white'
                : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200'
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {recipientMode === 'one' && (
        <label className="block text-xs font-semibold text-slate-600">
          Email do destinatário
          <input
            type="email"
            value={singleEmail}
            onChange={(e) => setSingleEmail(e.target.value)}
            list="admin-email-suggestions"
            placeholder="aluno@email.com"
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-600 dark:bg-slate-700"
          />
          <datalist id="admin-email-suggestions">
            {eligibleUsers.map((user) => (
              <option key={user.uid || user.email} value={user.email}>
                {user.displayName || user.email}
              </option>
            ))}
          </datalist>
        </label>
      )}

      {recipientMode === 'selected' && (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 p-3 dark:border-slate-600">
          <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-slate-500">
            <UsersIcon className="h-4 w-4" />
            {selectedEmails.length} selecionado(s)
          </p>
          <div className="space-y-2">
            {eligibleUsers.map((user) => (
              <label
                key={user.uid || user.email}
                className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-200"
              >
                <input
                  type="checkbox"
                  checked={selectedEmails.includes(user.email)}
                  onChange={() => toggleEmail(user.email)}
                />
                <span>
                  {user.displayName || 'Sem nome'} — {user.email}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {recipientMode === 'all' && (
        <p className="rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-700 dark:bg-violet-900/20 dark:text-violet-300">
          Será enviado para <strong>{eligibleUsers.length}</strong> usuários com email cadastrado.
        </p>
      )}
    </>
  )

  const contentFields = (
    <>
      {(title || message || subtitle) && <EmailDesignPreview model={previewModel} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-slate-600">
          Assunto do email *
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Novidade na plataforma"
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-600 dark:bg-slate-700"
          />
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Título no cabeçalho *
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Olá, estudante!"
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-600 dark:bg-slate-700"
          />
        </label>
      </div>

      <label className="block text-xs font-semibold text-slate-600">
        Subtítulo
        <input
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          placeholder="Complemento do título (opcional)"
          className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-600 dark:bg-slate-700"
        />
      </label>

      <label className="block text-xs font-semibold text-slate-600">
        Mensagem *
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          placeholder={'Escreva a mensagem...\n\nUse linhas em branco para separar parágrafos.'}
          className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-600 dark:bg-slate-700"
        />
      </label>

      <label className="block text-xs font-semibold text-slate-600">
        Destaque (box colorido, opcional)
        <input
          value={highlight}
          onChange={(e) => setHighlight(e.target.value)}
          placeholder="Frase de impacto"
          className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-600 dark:bg-slate-700"
        />
      </label>

      <label className="block text-xs font-semibold text-slate-600">
        Tópicos / bullets (um por linha, opcional)
        <textarea
          value={bulletsText}
          onChange={(e) => setBulletsText(e.target.value)}
          rows={3}
          placeholder={'Benefício 1\nBenefício 2'}
          className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-600 dark:bg-slate-700"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-slate-600">
          Botão (opcional)
          <input
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
            placeholder="Acessar plataforma"
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-600 dark:bg-slate-700"
          />
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Link do botão (opcional)
          <input
            value={ctaUrl}
            onChange={(e) => setCtaUrl(e.target.value)}
            placeholder="https://www.flashconcards.com.br/dashboard"
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-600 dark:bg-slate-700"
          />
        </label>
      </div>
    </>
  )

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800">
      <div className="absolute right-0 top-0 -mr-24 -mt-24 h-48 w-48 rounded-full bg-gradient-to-br from-violet-500/5 to-cyan-500/5 blur-3xl" />
      <div className="relative space-y-5">
        <div>
          <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-alego-600">
            <EnvelopeIcon className="h-5 w-5" />
            Enviar Email Formatado
          </p>
          <p className="text-xs text-slate-500">
            Escreva manualmente ou use a IA para montar o layout. Escolha um, vários ou todos os usuários.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {COMPOSE_MODES.map((mode) => {
            const Icon = mode.icon
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setComposeMode(mode.id)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition ${
                  composeMode === mode.id
                    ? 'bg-alego-600 text-white'
                    : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                {mode.label}
              </button>
            )
          })}
        </div>

        {composeMode === 'ai' && (
          <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-cyan-50 p-4 dark:border-violet-800 dark:from-violet-900/20 dark:to-cyan-900/10">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
              O que você quer comunicar?
              <textarea
                value={aiBrief}
                onChange={(e) => setAiBrief(e.target.value)}
                rows={4}
                placeholder={
                  'Ex.: Avise os alunos que lançamos simulados preditivos no curso PF 2025. Destaque que é novidade exclusiva e incentive acessar hoje.'
                }
                className="mt-2 w-full rounded-lg border border-violet-200 bg-white p-3 text-sm text-slate-800 focus:border-violet-400 focus:outline-none dark:border-violet-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <button
              type="button"
              onClick={handleGenerateWithAi}
              disabled={generating || !aiBrief.trim()}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:from-violet-700 hover:to-cyan-700 disabled:opacity-50"
            >
              <SparklesIcon className="h-4 w-4" />
              {generating ? 'Gerando email…' : 'Gerar email com IA'}
            </button>
          </div>
        )}

        {showForm && (
          <>
            {recipientSection}
            {contentFields}
          </>
        )}

        {composeMode === 'ai' && !showForm && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-700/50">
            Descreva o comunicado acima e clique em &quot;Gerar email com IA&quot; para montar o layout.
          </p>
        )}

        {feedback && (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${
              feedback.startsWith('✅')
                ? 'bg-emerald-50 text-emerald-700'
                : feedback.startsWith('⚠️')
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-rose-50 text-rose-700'
            }`}
          >
            {feedback}
          </p>
        )}

        {showForm && (
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className="inline-flex items-center gap-2 rounded-lg bg-alego-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-alego-700 disabled:opacity-50"
          >
            <PaperAirplaneIcon className="h-4 w-4" />
            {sending ? 'Enviando…' : 'Enviar email'}
          </button>
        )}
      </div>
    </div>
  )
}
