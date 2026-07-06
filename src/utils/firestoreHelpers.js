import { Timestamp } from 'firebase/firestore'

export function stripUndefined(obj) {
  if (!obj || typeof obj !== 'object') return obj
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined))
}

export function firestoreErrorMessage(err, fallback = 'Erro ao salvar. Tente novamente.') {
  if (!err) return fallback
  if (err.code === 'permission-denied') {
    return 'Permissão negada no Firestore. As regras de segurança precisam ser publicadas no Firebase.'
  }
  if (err.code === 'unavailable' || err.code === 'deadline-exceeded') {
    return 'Sem conexão com o servidor. Verifique sua internet.'
  }
  if (err.code === 'invalid-argument') {
    return 'Dados inválidos para salvar. Verifique os campos e tente de novo.'
  }
  return err.message ? `${fallback} (${err.message})` : fallback
}

export function toFirestoreDate(value) {
  if (!value) return Timestamp.now()
  if (value instanceof Timestamp) return value
  if (value instanceof Date) return Timestamp.fromDate(value)
  if (typeof value?.toDate === 'function') return value
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? Timestamp.now() : Timestamp.fromDate(parsed)
}
