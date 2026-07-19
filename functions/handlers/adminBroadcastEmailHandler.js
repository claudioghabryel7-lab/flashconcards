const admin = require('firebase-admin')
const {
  verifyAdminRequest,
  buildBrandedEmailHtml,
  paragraphsToHtml,
  sendBrandedEmail,
} = require('../emailUtils')

async function handleSendAdminBroadcastEmail(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).send('')
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  try {
    const adminUser = await verifyAdminRequest(req)
    const {
      subject,
      title,
      subtitle = '',
      message,
      highlight = '',
      bullets = [],
      recipientMode = 'one',
      recipients = [],
      ctaLabel = '',
      ctaUrl = '',
    } = req.body || {}

    if (!subject?.trim() || !title?.trim() || !message?.trim()) {
      return res.status(400).json({ error: 'Assunto, título e mensagem são obrigatórios.' })
    }

    let targetEmails = []

    if (recipientMode === 'all') {
      const usersSnap = await admin.firestore().collection('users').get()
      targetEmails = usersSnap.docs
        .map((docSnap) => docSnap.data())
        .filter((user) => user?.email && !user.deleted && user.role !== 'admin')
        .map((user) => user.email)
    } else {
      targetEmails = Array.isArray(recipients) ? recipients : [recipients]
    }

    targetEmails = [
      ...new Set(
        targetEmails
          .filter((email) => email != null && String(email).trim())
          .map((email) => String(email).toLowerCase().trim())
          .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
      ),
    ]

    if (!targetEmails.length) {
      return res.status(400).json({ error: 'Nenhum destinatário válido encontrado.' })
    }

    const paragraphs = String(message)
      .split(/\n{2,}|\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    const html = buildBrandedEmailHtml({
      title: title.trim(),
      subtitle: (subtitle || subject).trim(),
      bodyHtml: paragraphsToHtml(paragraphs),
      highlight: String(highlight || '').trim(),
      bullets: Array.isArray(bullets) ? bullets.filter(Boolean) : [],
      ctaLabel: ctaLabel?.trim() || '',
      ctaUrl: ctaUrl?.trim() || '',
    })

    const results = []
    let sent = 0
    let failed = 0
    let errorSummary = ''

    for (const email of targetEmails) {
      try {
        await sendBrandedEmail({
          to: email,
          subject: subject.trim(),
          html,
          text: paragraphs.join('\n\n'),
        })
        sent += 1
        results.push({ email, status: 'sent' })
      } catch (sendErr) {
        failed += 1
        const errMsg = sendErr.message || 'Erro ao enviar'
        results.push({ email, status: 'error', error: errMsg, code: sendErr.code || null })
        if (!errorSummary) errorSummary = errMsg
        console.error(`[broadcastEmail] Falha ao enviar para ${email}:`, sendErr)
      }
    }

    try {
      await admin.firestore().collection('broadcastEmailHistory').add({
        subject: subject.trim(),
        title: title.trim(),
        message: message.trim(),
        recipientMode,
        recipientCount: targetEmails.length,
        sent,
        failed,
        sentBy: adminUser.uid,
        sentByEmail: adminUser.email || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    } catch (historyErr) {
      console.error('[broadcastEmail] Erro ao salvar histórico:', historyErr)
    }

    return res.status(200).json({
      success: failed === 0,
      sent,
      failed,
      total: targetEmails.length,
      results,
      errorSummary: sent === 0 && failed > 0 ? errorSummary : '',
    })
  } catch (error) {
    console.error('[broadcastEmail] Erro no envio em massa:', error)
    const status = error.status || 500
    return res.status(status).json({
      error: error.message || 'Erro ao enviar emails',
      details: error.message,
    })
  }
}

module.exports = { handleSendAdminBroadcastEmail }
