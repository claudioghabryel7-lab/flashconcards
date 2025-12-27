/**
 * Função para criar slug amigável a partir de texto
 * Ex: "PMGO Notícias" -> "pmgo-noticias"
 */
export function createSlug(text) {
  if (!text) return ''
  
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD') // Normaliza caracteres acentuados
    .replace(/[\u0300-\u036f]/g, '') // Remove diacríticos
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove caracteres especiais
    .replace(/[\s_-]+/g, '-') // Substitui espaços e underscores por hífen
    .replace(/^-+|-+$/g, '') // Remove hífens do início e fim
}

/**
 * Função para buscar curso por slug
 */
export async function getCourseBySlug(slug, db) {
  const { collection, query, where, getDocs } = await import('firebase/firestore')
  const coursesRef = collection(db, 'courses')
  const q = query(coursesRef, where('slug', '==', slug))
  const snapshot = await getDocs(q)
  
  if (!snapshot.empty) {
    const doc = snapshot.docs[0]
    return { id: doc.id, ...doc.data() }
  }
  
  return null
}

