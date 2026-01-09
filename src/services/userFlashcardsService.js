import { collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'

// Usar a coleção flashcards existente, mas com userId para identificar cards individuais
const FLASHCARDS_COLLECTION = 'flashcards'

// Serviço para gerenciar flashcards individuais dos usuários integrados ao sistema principal
export const userFlashcardsService = {
  // Criar um novo flashcard para o usuário (integrado ao sistema principal)
  async createFlashcard(userId, flashcardData) {
    try {
      const flashcardRef = collection(db, FLASHCARDS_COLLECTION)
      const newFlashcard = {
        userId, // Identificar que é um flashcard individual do usuário
        pergunta: flashcardData.pergunta,
        resposta: flashcardData.resposta,
        materia: flashcardData.materia || 'Geral',
        modulo: flashcardData.modulo || 'Geral',
        dificuldade: flashcardData.dificuldade || 'fácil',
        tags: flashcardData.tags || [],
        isUserCreated: true, // Marcar como criado pelo usuário
        courseId: flashcardData.courseId || null, // Manter compatibilidade com sistema de cursos
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        // SRS - Repetição Espaçada
        srsData: {
          interval: 1,
          repetitions: 0,
          easeFactor: 2.5,
          nextReviewDate: new Date(),
          lastReviewed: null,
          status: 'new' // new, learning, review, mastered
        }
      }
      
      const docRef = await addDoc(flashcardRef, newFlashcard)
      return { id: docRef.id, ...newFlashcard }
    } catch (error) {
      console.error('Erro ao criar flashcard do usuário:', error)
      throw error
    }
  },

  // Obter todos os flashcards de um usuário// Obter flashcards do usuário (abordagem simples sem índice composto)
  async getUserFlashcards(userId, courseId = null) {
    try {
      // Consulta simples: apenas por userId, sem orderBy para evitar erro de índice
      const q = query(
        collection(db, FLASHCARDS_COLLECTION),
        where('userId', '==', userId)
      )

      const querySnapshot = await getDocs(q)
      let flashcards = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      
      // Ordenar no cliente por data de criação (mais recentes primeiro)
      flashcards.sort((a, b) => {
        const dateA = a.createdAt?.toMillis() || 0
        const dateB = b.createdAt?.toMillis() || 0
        return dateB - dateA
      })
      
      // Filtrar por curso no cliente se necessário
      if (courseId && courseId !== 'alego-default') {
        flashcards = flashcards.filter(card => card.courseId === courseId)
      } else if (!courseId || courseId === 'alego-default') {
        flashcards = flashcards.filter(card => 
          !card.courseId || card.courseId === '' || card.courseId === 'alego-default'
        )
      }
      
      console.log(`📝 Carregados ${flashcards.length} flashcards do usuário`)
      return flashcards
    } catch (error) {
      console.error('Erro ao obter flashcards do usuário:', error)
      throw error
    }
  },

  // Obter um flashcard específico
  async getFlashcard(flashcardId) {
    try {
      const flashcardRef = doc(db, FLASHCARDS_COLLECTION, flashcardId)
      const flashcardSnap = await getDoc(flashcardRef)
      
      if (flashcardSnap.exists()) {
        return { id: flashcardSnap.id, ...flashcardSnap.data() }
      }
      return null
    } catch (error) {
      console.error('Erro ao obter flashcard:', error)
      throw error
    }
  },

  // Atualizar um flashcard
  async updateFlashcard(flashcardId, updateData) {
    try {
      const flashcardRef = doc(db, FLASHCARDS_COLLECTION, flashcardId)
      await updateDoc(flashcardRef, {
        ...updateData,
        updatedAt: serverTimestamp()
      })
      
      // Retornar o documento atualizado
      return await this.getFlashcard(flashcardId)
    } catch (error) {
      console.error('Erro ao atualizar flashcard:', error)
      throw error
    }
  },

  // Excluir um flashcard
  async deleteFlashcard(flashcardId) {
    try {
      const flashcardRef = doc(db, FLASHCARDS_COLLECTION, flashcardId)
      await deleteDoc(flashcardRef)
      return true
    } catch (error) {
      console.error('Erro ao excluir flashcard:', error)
      throw error
    }
  },

  // Atualizar progresso SRS do flashcard (simplificado - apenas Fácil e Difícil)
  async updateSRSProgress(flashcardId, quality) {
    try {
      const flashcard = await this.getFlashcard(flashcardId)
      if (!flashcard) throw new Error('Flashcard não encontrado')

      const srsData = { ...flashcard.srsData }
      const now = new Date()

      // Sistema simplificado: apenas Fácil (15 min) e Difícil (1 min)
      srsData.repetitions += 1
      srsData.lastReviewed = now

      if (quality >= 3) { // Fácil - repetir depois de 15 minutos
        srsData.interval = 15 // 15 minutos
        srsData.status = 'easy'
        console.log(`📊 Card ${flashcardId} marcado como FÁCIL - Próxima revisão: 15 minutos`)
      } else { // Difícil - repetir depois de 1 minuto
        srsData.interval = 1 // 1 minuto
        srsData.status = 'hard'
        console.log(`📊 Card ${flashcardId} marcado como DIFÍCIL - Próxima revisão: 1 minuto`)
      }

      // Calcular próxima data de revisão
      const nextReview = new Date(now)
      nextReview.setMinutes(nextReview.getMinutes() + srsData.interval)
      srsData.nextReviewDate = nextReview
      
      console.log(`⏰ Próxima revisão agendada para: ${nextReview.toLocaleTimeString()}`)

      await this.updateFlashcard(flashcardId, { srsData })
      return srsData
    } catch (error) {
      console.error('Erro ao atualizar progresso SRS:', error)
      throw error
    }
  },

  // Obter flashcards para revisão (próximos da data)
  async getFlashcardsForReview(userId, courseId = null) {
    try {
      const now = new Date()
      let q = query(
        collection(db, FLASHCARDS_COLLECTION),
        where('userId', '==', userId),
        where('srsData.nextReviewDate', '<=', now)
      )

      // Filtrar por curso se especificado
      if (courseId && courseId !== 'alego-default') {
        q = query(q, where('courseId', '==', courseId))
      } else if (!courseId || courseId === 'alego-default') {
        q = query(q, where('courseId', 'in', [null, '', 'alego-default']))
      }

      q = query(q, orderBy('srsData.nextReviewDate', 'asc'))

      const querySnapshot = await getDocs(q)
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    } catch (error) {
      console.error('Erro ao obter flashcards para revisão:', error)
      throw error
    }
  },

  // Listener em tempo real para flashcards do usuário (abordagem simples)
  subscribeToUserFlashcards(userId, callback, courseId = null) {
    // Consulta simples: apenas por userId, sem orderBy para evitar erro de índice
    const q = query(
      collection(db, FLASHCARDS_COLLECTION),
      where('userId', '==', userId)
    )

    return onSnapshot(q, (querySnapshot) => {
      let flashcards = querySnapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }))
      
      // Ordenar no cliente por data de criação (mais recentes primeiro)
      flashcards.sort((a, b) => {
        const dateA = a.createdAt?.toMillis() || 0
        const dateB = b.createdAt?.toMillis() || 0
        return dateB - dateA
      })
      
      // Filtrar por curso no cliente se necessário
      if (courseId && courseId !== 'alego-default') {
        flashcards = flashcards.filter(card => card.courseId === courseId)
      } else if (!courseId || courseId === 'alego-default') {
        flashcards = flashcards.filter(card => 
          !card.courseId || card.courseId === '' || card.courseId === 'alego-default'
        )
      }
      
      callback(flashcards)
    })
  },

  // Estatísticas dos flashcards do usuário
  async getUserFlashcardsStats(userId, courseId = null) {
    try {
      const flashcards = await this.getUserFlashcards(userId, courseId)
      
      const stats = {
        total: flashcards.length,
        byStatus: {
          easy: 0, // Fácil
          hard: 0, // Difícil
        },
        byMateria: {},
        byDificuldade: {
          fácil: 0,
          difícil: 0
        },
        dueToday: 0,
        overdue: 0
      }

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      flashcards.forEach(card => {
        // Por status (agora apenas easy/hard)
        if (stats.byStatus[card.srsData.status] !== undefined) {
          stats.byStatus[card.srsData.status]++
        }

        // Por matéria
        if (!stats.byMateria[card.materia]) {
          stats.byMateria[card.materia] = 0
        }
        stats.byMateria[card.materia]++

        // Por dificuldade (apenas fácil/difícil)
        if (stats.byDificuldade[card.dificuldade] !== undefined) {
          stats.byDificuldade[card.dificuldade]++
        }

        // Revisões pendentes
        const reviewDate = new Date(card.srsData.nextReviewDate)
        reviewDate.setHours(0, 0, 0, 0)
        
        if (reviewDate.getTime() === today.getTime()) {
          stats.dueToday++
        } else if (reviewDate < today) {
          stats.overdue++
        }
      })

      return stats
    } catch (error) {
      console.error('Erro ao obter estatísticas:', error)
      throw error
    }
  }
}
