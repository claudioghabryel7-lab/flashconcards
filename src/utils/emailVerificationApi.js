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

export async function callAuthCloudFunction(url, body = {}) {
  const user = auth?.currentUser
  if (!user) throw new Error('Faça login para continuar.')

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

export function requestEmailVerificationCode() {
  return callAuthCloudFunction(FIREBASE_FUNCTIONS.sendEmailVerificationCode, {})
}

export function submitEmailVerificationCode(code) {
  return callAuthCloudFunction(FIREBASE_FUNCTIONS.verifyEmailCode, { code })
}
