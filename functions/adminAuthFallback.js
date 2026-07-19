/**
 * Auth admin sem service account (Vercel / Next.js).
 * Usa Identity Toolkit (API key pública) + Firestore REST com o ID token do usuário.
 */
'use strict'

function getProjectId() {
  return (
    process.env.VITE_FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    'plegi-d84c2'
  )
}

function getFirebaseWebApiKey() {
  return (
    process.env.VITE_FIREBASE_API_KEY ||
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    process.env.FIREBASE_API_KEY ||
    ''
  )
}

function isCredentialError(err) {
  const msg = String(err?.message || err || '')
  return /default credentials|Could not load the default credentials|Unable to detect a Project Id|FIREBASE_SERVICE_ACCOUNT|credential/i.test(
    msg,
  )
}

async function lookupUserByIdToken(idToken) {
  const apiKey = getFirebaseWebApiKey()
  if (!apiKey) {
    const err = new Error(
      'FIREBASE_SERVICE_ACCOUNT_KEY ausente e VITE_FIREBASE_API_KEY também. Configure a service account no Vercel.',
    )
    err.status = 500
    throw err
  }

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.users?.[0]) {
    const err = new Error(data.error?.message || 'Token inválido ou expirado.')
    err.status = 401
    throw err
  }
  const u = data.users[0]
  return {
    uid: u.localId,
    email: u.email || null,
    email_verified: Boolean(u.emailVerified),
  }
}

async function fetchFirestoreDocWithUserToken(idToken, docPath) {
  const projectId = getProjectId()
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${docPath}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  })
  if (res.status === 404) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error?.message || `Firestore REST falhou (${res.status})`)
    err.status = res.status >= 400 && res.status < 600 ? res.status : 500
    throw err
  }
  return data
}

function firestoreValueToJs(value) {
  if (!value || typeof value !== 'object') return null
  if ('stringValue' in value) return value.stringValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return Number(value.doubleValue)
  if ('booleanValue' in value) return Boolean(value.booleanValue)
  if ('nullValue' in value) return null
  if ('timestampValue' in value) return value.timestampValue
  if ('mapValue' in value) {
    const fields = value.mapValue.fields || {}
    const out = {}
    for (const [k, v] of Object.entries(fields)) out[k] = firestoreValueToJs(v)
    return out
  }
  if ('arrayValue' in value) {
    return (value.arrayValue.values || []).map(firestoreValueToJs)
  }
  return null
}

function docFieldsToObject(doc) {
  const fields = doc?.fields || {}
  const out = {}
  for (const [k, v] of Object.entries(fields)) out[k] = firestoreValueToJs(v)
  return out
}

/**
 * Verifica admin sem Firebase Admin SDK.
 * @returns {{ uid: string, email: string|null, idToken: string }}
 */
async function verifyAdminWithUserToken(idToken) {
  const decoded = await lookupUserByIdToken(idToken)
  const doc = await fetchFirestoreDocWithUserToken(idToken, `users/${decoded.uid}`)
  if (!doc) {
    const err = new Error('Apenas administradores podem executar esta ação.')
    err.status = 403
    throw err
  }
  const data = docFieldsToObject(doc)
  if (data.role !== 'admin') {
    const err = new Error('Apenas administradores podem executar esta ação.')
    err.status = 403
    throw err
  }
  return { uid: decoded.uid, email: decoded.email, idToken }
}

/**
 * Lista emails de alunos via Firestore REST (token do admin).
 */
async function listStudentEmailsWithUserToken(idToken) {
  const projectId = getProjectId()
  const emails = []
  let pageToken = ''

  do {
    const qs = new URLSearchParams({ pageSize: '300' })
    if (pageToken) qs.set('pageToken', pageToken)
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users?${qs}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(data.error?.message || 'Falha ao listar usuários no Firestore.')
      err.status = res.status || 500
      throw err
    }
    for (const doc of data.documents || []) {
      const row = docFieldsToObject(doc)
      if (!row?.email || row.deleted || row.role === 'admin') continue
      emails.push(String(row.email))
    }
    pageToken = data.nextPageToken || ''
  } while (pageToken)

  return emails
}

module.exports = {
  isCredentialError,
  lookupUserByIdToken,
  verifyAdminWithUserToken,
  listStudentEmailsWithUserToken,
  getProjectId,
  getFirebaseWebApiKey,
}
