const admin = require('firebase-admin')
const { verifyAdminRequest, sendAccountWelcomeEmail } = require('../emailUtils')

async function handleRunContentAutomationNow(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).send('')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })
  try {
    await verifyAdminRequest(req)
    const force = req.body?.force !== false
    const { runContentAutomationRelease } = require('../generation/contentAutomationRelease')
    const result = await runContentAutomationRelease({ force, respectSchedule: !force })
    return res.status(200).json({ ok: true, ...result })
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Erro na automação de conteúdo' })
  }
}

async function handleSendRetroactiveWelcomeEmails(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).send('')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })
  try {
    await verifyAdminRequest(req)
    const usersSnap = await admin.firestore().collection('users').get()
    let sent = 0
    let skipped = 0
    let failed = 0

    for (const docSnap of usersSnap.docs) {
      const data = docSnap.data() || {}
      const uid = docSnap.id
      const isVerified =
        data.emailVerified === true ||
        (await admin.auth().getUser(uid).then((u) => u.emailVerified).catch(() => false))
      if (!isVerified) {
        skipped += 1
        continue
      }
      try {
        await sendAccountWelcomeEmail(uid)
        sent += 1
      } catch {
        failed += 1
      }
    }

    return res.status(200).json({ sent, skipped, failed, total: usersSnap.size })
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Erro ao enviar emails.' })
  }
}

module.exports = { handleRunContentAutomationNow, handleSendRetroactiveWelcomeEmails }
