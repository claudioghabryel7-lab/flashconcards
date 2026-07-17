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
    const err = new Error(data.error || data.details || `Erro ${response.status}`)
    err.code = data.code || null
    err.status = response.status
    throw err
  }
  return data
}

export async function callAuthCloudFunction(url, body = {}) {
  const user = auth?.currentUser
  if (!user) throw new Error('Faça login para continuar.')

  let response
  try {
    const token = await user.getIdToken(false)
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
  } catch (networkErr) {
    throw new Error(
      networkErr?.message?.includes('Failed to fetch')
        ? 'Não foi possível contactar o servidor. Verifique sua conexão e tente de novo.'
        : networkErr?.message || 'Erro de rede.',
    )
  }

  if (response.status === 401) {
    const token = await user.getIdToken(true)
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })
  }

  return parseCloudResponse(response)
}

async function callWithV2Fallback(v2Url, v1Url, body) {
  if (!v2Url) return callAuthCloudFunction(v1Url, body)
  try {
    return await callAuthCloudFunction(v2Url, body)
  } catch (err) {
    const retryV1 =
      err.status === 404 ||
      err.status === 503 ||
      String(err.message || '').includes('Failed to fetch')
    if (retryV1 && v1Url && v1Url !== v2Url) {
      return callAuthCloudFunction(v1Url, body)
    }
    throw err
  }
}

export function requestEmailVerificationCode() {
  return callWithV2Fallback(
    FIREBASE_FUNCTIONS.sendEmailVerificationCodeV2,
    FIREBASE_FUNCTIONS.sendEmailVerificationCode,
    {},
  )
}

export function submitEmailVerificationCode(code) {
  return callWithV2Fallback(
    FIREBASE_FUNCTIONS.verifyEmailCodeV2,
    FIREBASE_FUNCTIONS.verifyEmailCode,
    { code },
  )
}
