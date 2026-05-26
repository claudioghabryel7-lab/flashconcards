import CryptoJS from 'crypto-js'

const SECRET_KEY = import.meta.env.VITE_SHARE_SECRET_KEY || 'flashconcards-share-secret-2024'

/**
 * Gera um token temporário para compartilhamento de flashcards
 * @param {Object} data - { courseId, disciplina, modulo, topicKey }
 * @returns {string} Token criptografado em base64
 */
export function generateShareToken(data) {
  const payload = {
    ...data,
    createdAt: Date.now(),
    expiresAt: Date.now() + (60 * 60 * 1000), // 1 hora
  }
  
  const jsonString = JSON.stringify(payload)
  const encrypted = CryptoJS.AES.encrypt(jsonString, SECRET_KEY).toString()
  return encrypted
}

/**
 * Verifica e decodifica um token de compartilhamento
 * @param {string} token - Token criptografado
 * @returns {Object|null} Dados decodificados ou null se inválido/expirado
 */
export function verifyShareToken(token) {
  try {
    const decrypted = CryptoJS.AES.decrypt(token, SECRET_KEY)
    const jsonString = decrypted.toString(CryptoJS.enc.Utf8)
    
    if (!jsonString) {
      return null
    }
    
    const payload = JSON.parse(jsonString)
    
    // Verifica se expirou
    if (Date.now() > payload.expiresAt) {
      return null
    }
    
    return payload
  } catch (error) {
    console.error('Erro ao verificar token:', error)
    return null
  }
}

/**
 * Verifica se o token é válido (não expirado)
 * @param {string} token - Token criptografado
 * @returns {boolean}
 */
export function isTokenValid(token) {
  return verifyShareToken(token) !== null
}
