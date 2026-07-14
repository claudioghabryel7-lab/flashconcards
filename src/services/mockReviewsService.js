import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { readImageAsBase64 } from '../utils/imageBase64'

const CONFIG_PATH = ['config', 'mockReviews']
const COLLECTION = 'mockReviews'

export const DEFAULT_MOCK_REVIEWS = [
  {
    userName: 'Ana Beatriz Silva',
    rating: 5,
    comment:
      'Os flashcards com IA mudaram meu ritmo de estudo. Passei a revisar o que realmente cai na banca.',
    photoUrl: 'https://i.pravatar.cc/150?u=ana-beatriz-fcc',
  },
  {
    userName: 'Carlos Eduardo Mendes',
    rating: 5,
    comment:
      'Material bem objetivo. Em poucas semanas já senti diferença no simulado — recomendo demais!',
    photoUrl: 'https://i.pravatar.cc/150?u=carlos-eduardo-fcc',
  },
  {
    userName: 'Juliana Rocha',
    rating: 5,
    comment:
      'O Guia Mentorado organiza o dia a dia. Consigo estudar sem me perder no edital gigante.',
    photoUrl: 'https://i.pravatar.cc/150?u=juliana-rocha-fcc',
  },
  {
    userName: 'Pedro Henrique Alves',
    rating: 4,
    comment:
      'Gostei bastante das questões por nível. Dá pra evoluir sem ficar só no básico.',
    photoUrl: 'https://i.pravatar.cc/150?u=pedro-henrique-fcc',
  },
  {
    userName: 'Fernanda Costa Lima',
    rating: 5,
    comment:
      'Interface limpa e conteúdo atualizado. Vale cada centavo da assinatura.',
    photoUrl: 'https://i.pravatar.cc/150?u=fernanda-costa-fcc',
  },
  {
    userName: 'Ricardo Nogueira',
    rating: 5,
    comment:
      'Aprovação mais perto depois que foquei nos temas de incidência. Plataforma top!',
    photoUrl: 'https://i.pravatar.cc/150?u=ricardo-nogueira-fcc',
  },
]

export function subscribeMockReviewsConfig(onData) {
  if (!db) return () => {}
  return onSnapshot(doc(db, ...CONFIG_PATH), (snap) => {
    onData(snap.exists() ? snap.data() : { enabled: false })
  })
}

export function subscribeMockReviews(onData) {
  if (!db) return () => {}
  return onSnapshot(collection(db, COLLECTION), (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    rows.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() || a.createdAt?.seconds * 1000 || 0
      const tb = b.createdAt?.toMillis?.() || b.createdAt?.seconds * 1000 || 0
      return tb - ta
    })
    onData(rows)
  })
}

export async function setMockReviewsEnabled(enabled) {
  if (!db) throw new Error('Firestore indisponível.')
  await setDoc(
    doc(db, ...CONFIG_PATH),
    {
      enabled: Boolean(enabled),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

/**
 * Converte a foto em data URL (base64) e salva no Firestore —
 * mesmo padrão do avatar do perfil, sem depender do Storage.
 */
export async function uploadMockReviewPhoto(file) {
  if (!file) throw new Error('Selecione uma foto.')
  return readImageAsBase64(file, 320)
}

export async function createMockReview({
  userName,
  comment,
  rating = 5,
  photoUrl = '',
  active = true,
}) {
  if (!db) throw new Error('Firestore indisponível.')
  const name = String(userName || '').trim()
  const text = String(comment || '').trim()
  if (!name) throw new Error('Informe o nome.')
  if (!text) throw new Error('Informe o comentário.')
  if (!photoUrl) throw new Error('Adicione uma foto (obrigatória).')

  const refDoc = await addDoc(collection(db, COLLECTION), {
    userName: name,
    comment: text,
    rating: Math.min(5, Math.max(1, Number(rating) || 5)),
    photoUrl: String(photoUrl),
    active: Boolean(active),
    isMock: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return refDoc.id
}

export async function updateMockReview(id, patch) {
  if (!db || !id) throw new Error('ID inválido.')
  const data = { ...patch, updatedAt: serverTimestamp() }
  if (data.userName != null) {
    data.userName = String(data.userName).trim()
    if (!data.userName) throw new Error('Informe o nome.')
  }
  if (data.comment != null) {
    data.comment = String(data.comment).trim()
    if (!data.comment) throw new Error('Informe o comentário.')
  }
  if (data.photoUrl != null) {
    data.photoUrl = String(data.photoUrl).trim()
    if (!data.photoUrl) throw new Error('Adicione uma foto (obrigatória).')
  }
  if (data.rating != null) {
    data.rating = Math.min(5, Math.max(1, Number(data.rating) || 5))
  }
  await updateDoc(doc(db, COLLECTION, id), data)
}

export async function setMockReviewActive(id, active) {
  return updateMockReview(id, { active: Boolean(active) })
}

export async function deleteMockReview(id) {
  if (!db || !id) throw new Error('ID inválido.')
  await deleteDoc(doc(db, COLLECTION, id))
}

export async function seedDefaultMockReviews() {
  if (!db) throw new Error('Firestore indisponível.')
  const existing = await getDocs(collection(db, COLLECTION))
  if (!existing.empty) {
    throw new Error('Já existem comentários mocados. Apague-os antes de gerar exemplos.')
  }
  const ids = []
  for (const item of DEFAULT_MOCK_REVIEWS) {
    const id = await createMockReview({ ...item, active: true })
    ids.push(id)
  }
  await setMockReviewsEnabled(true)
  return ids
}

/** Público: mocks ativos se o master switch estiver ligado. */
export async function fetchActiveMockReviewsForPublic() {
  if (!db) return []
  const cfg = await getDoc(doc(db, ...CONFIG_PATH))
  if (!cfg.exists() || cfg.data()?.enabled !== true) return []

  const snap = await getDocs(collection(db, COLLECTION))
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => r.active !== false && String(r.comment || '').trim() && r.photoUrl)
    .sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() || 0
      const tb = b.createdAt?.toMillis?.() || 0
      return tb - ta
    })
}
