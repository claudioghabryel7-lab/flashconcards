import { auth } from '../firebase/config'
import { FIREBASE_FUNCTIONS } from '../config/firebaseFunctions'

async function parseCloudResponse(response) {
  let data = {}
  try {
    data = await response.json()
  } catch {
    data = { error: `Resposta inválida do servidor (HTTP ${response.status}).` }
  }
  if (!response.ok) {
    throw new Error(data.error || data.details || `Erro ${response.status}`)
  }
  return data
}

export async function callPublicCloudFunction(url, body = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseCloudResponse(response)
}

export async function callAdminCloudFunction(url, body = {}) {
  const user = auth?.currentUser
  if (!user) throw new Error('Faça login como administrador.')

  const token = await user.getIdToken()
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  return parseCloudResponse(response)
}

export function requestPasswordResetEmail(email) {
  return callPublicCloudFunction(FIREBASE_FUNCTIONS.sendPasswordResetEmail, {
    email: email.toLowerCase().trim(),
    baseUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
  })
}

export function sendAdminBroadcastEmail(payload) {
  return callAdminCloudFunction(FIREBASE_FUNCTIONS.sendAdminBroadcastEmail, payload)
}
