'use client'

import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'

/**
 * Configuração de pagamento (plano mensal) + chatbot da home.
 * Usado no AdminPanel.
 */
export default function AdminPaymentChatbotConfig() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [payment, setPayment] = useState({
    monthlyEnabled: true,
    defaultMonthlyPrice: 39.9,
    notes: '',
  })
  const [chatbot, setChatbot] = useState({
    name: 'Assistente FlashCon',
    welcomeMessage: 'Olá! Posso te ajudar a escolher um curso e explicar o que cada um oferece.',
    extraInfo: '',
    avatarUrl: '',
    avatarBase64: '',
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [p, c] = await Promise.all([
          getDoc(doc(db, 'config', 'payment')),
          getDoc(doc(db, 'config', 'chatbot')),
        ])
        if (cancelled) return
        if (p.exists()) setPayment((prev) => ({ ...prev, ...p.data() }))
        if (c.exists()) setChatbot((prev) => ({ ...prev, ...c.data() }))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const onAvatarFile = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setChatbot((prev) => ({
        ...prev,
        avatarBase64: String(reader.result || ''),
        avatarUrl: '',
      }))
    }
    reader.readAsDataURL(file)
  }

  const save = async () => {
    setSaving(true)
    setMessage('')
    try {
      await Promise.all([
        setDoc(
          doc(db, 'config', 'payment'),
          {
            ...payment,
            defaultMonthlyPrice: Number(payment.defaultMonthlyPrice) || 39.9,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        ),
        setDoc(
          doc(db, 'config', 'chatbot'),
          {
            ...chatbot,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        ),
      ])
      setMessage('Configurações salvas.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-text-muted">Carregando configurações…</p>
  }

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-border-primary bg-background-card p-4 sm:p-6">
        <h3 className="text-lg font-bold text-text-primary">Pagamento · Plano mensal</h3>
        <p className="mt-1 text-sm text-text-muted">
          O preço à vista continua sendo o do curso. Aqui você define o plano mensal (mais barato) via Mercado Pago.
          Também dá para sobrescrever por curso no campo &quot;Preço mensal&quot;.
        </p>
        <label className="mt-4 flex items-center gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={Boolean(payment.monthlyEnabled)}
            onChange={(e) => setPayment((p) => ({ ...p, monthlyEnabled: e.target.checked }))}
          />
          Oferecer plano mensal no checkout
        </label>
        <label className="mt-3 block text-xs text-text-muted">
          Preço mensal padrão (R$)
          <input
            type="number"
            min="1"
            step="0.01"
            value={payment.defaultMonthlyPrice}
            onChange={(e) =>
              setPayment((p) => ({ ...p, defaultMonthlyPrice: Number(e.target.value) }))
            }
            className="mt-1 w-full max-w-xs rounded-lg border border-border-primary bg-background-card-hover px-3 py-2 text-sm text-text-primary"
          />
        </label>
        <label className="mt-3 block text-xs text-text-muted">
          Observações internas
          <textarea
            value={payment.notes || ''}
            onChange={(e) => setPayment((p) => ({ ...p, notes: e.target.value }))}
            rows={2}
            className="mt-1 w-full rounded-lg border border-border-primary bg-background-card-hover px-3 py-2 text-sm text-text-primary"
          />
        </label>
        <p className="mt-3 text-xs text-text-muted">
          Credenciais Mercado Pago ficam só no servidor (`.env` / Vercel). Nunca cole Access Token no painel.
        </p>
      </section>

      <section className="rounded-xl border border-border-primary bg-background-card p-4 sm:p-6">
        <h3 className="text-lg font-bold text-text-primary">Chatbot da home</h3>
        <p className="mt-1 text-sm text-text-muted">
          Foto, nome e informações extras que a IA usa ao falar dos cursos na página inicial.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {(chatbot.avatarUrl || chatbot.avatarBase64) && (
            <img
              src={chatbot.avatarUrl || chatbot.avatarBase64}
              alt="Avatar"
              className="h-16 w-16 rounded-full object-cover border border-border-primary"
            />
          )}
          <label className="text-xs text-text-muted">
            Foto de perfil
            <input
              type="file"
              accept="image/*"
              className="mt-1 block text-sm"
              onChange={(e) => onAvatarFile(e.target.files?.[0])}
            />
          </label>
        </div>
        <label className="mt-3 block text-xs text-text-muted">
          URL da foto (opcional, se não enviar arquivo)
          <input
            value={chatbot.avatarUrl || ''}
            onChange={(e) =>
              setChatbot((c) => ({ ...c, avatarUrl: e.target.value, avatarBase64: '' }))
            }
            className="mt-1 w-full rounded-lg border border-border-primary bg-background-card-hover px-3 py-2 text-sm text-text-primary"
            placeholder="https://..."
          />
        </label>
        <label className="mt-3 block text-xs text-text-muted">
          Nome do chatbot
          <input
            value={chatbot.name || ''}
            onChange={(e) => setChatbot((c) => ({ ...c, name: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-border-primary bg-background-card-hover px-3 py-2 text-sm text-text-primary"
          />
        </label>
        <label className="mt-3 block text-xs text-text-muted">
          Mensagem de boas-vindas
          <textarea
            value={chatbot.welcomeMessage || ''}
            onChange={(e) => setChatbot((c) => ({ ...c, welcomeMessage: e.target.value }))}
            rows={2}
            className="mt-1 w-full rounded-lg border border-border-primary bg-background-card-hover px-3 py-2 text-sm text-text-primary"
          />
        </label>
        <label className="mt-3 block text-xs text-text-muted">
          Informações adicionais para a IA (promoções, diferenciais, tom de voz…)
          <textarea
            value={chatbot.extraInfo || ''}
            onChange={(e) => setChatbot((c) => ({ ...c, extraInfo: e.target.value }))}
            rows={5}
            className="mt-1 w-full rounded-lg border border-border-primary bg-background-card-hover px-3 py-2 text-sm text-text-primary"
            placeholder="Ex.: Mencione que o plano mensal libera acesso imediato; destaque banca CESPE nos cursos X…"
          />
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="rounded-lg bg-gradient-to-r from-accent-orange to-accent-cyan px-5 py-2.5 text-sm font-bold text-background-primary disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Salvar configurações'}
        </button>
        {message && <span className="text-sm text-text-secondary">{message}</span>}
      </div>
    </div>
  )
}
