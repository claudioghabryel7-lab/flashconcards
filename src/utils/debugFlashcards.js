import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'

export const debugFlashcards = async () => {
  try {
    console.log('🔍 DEBUG: Buscando todos os flashcards no banco...')
    
    const allQuery = collection(db, 'flashcards')
    const allSnapshot = await getDocs(allQuery)
    const allFlashcards = allSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    
    console.log('📊 Total de flashcards encontrados:', allFlashcards.length)
    
    if (allFlashcards.length > 0) {
      console.log('📋 Estrutura dos flashcards:')
      allFlashcards.slice(0, 5).forEach((card, index) => {
        console.log(`Flashcard ${index + 1}:`, {
          id: card.id,
          pergunta: card.pergunta?.substring(0, 50) + '...',
          resposta: card.resposta?.substring(0, 50) + '...',
          materia: card.materia,
          modulo: card.modulo,
          userId: card.userId,
          isUserCreated: card.isUserCreated,
          courseId: card.courseId,
          createdAt: card.createdAt
        })
      })
      
      // Contar por matéria
      const porMateria = {}
      allFlashcards.forEach(card => {
        const materia = card.materia || 'Sem matéria'
        porMateria[materia] = (porMateria[materia] || 0) + 1
      })
      
      console.log('📚 Flashcards por matéria:', porMateria)
      
      // Verificar campos
      const comUserId = allFlashcards.filter(c => c.userId).length
      const semUserId = allFlashcards.filter(c => !c.userId).length
      const comUserCreated = allFlashcards.filter(c => c.isUserCreated === true).length
      
      console.log('🔍 Análise de campos:')
      console.log(`- Com userId: ${comUserId}`)
      console.log(`- Sem userId: ${semUserId}`)
      console.log(`- Com isUserCreated: ${comUserCreated}`)
    } else {
      console.log('❌ Nenhum flashcard encontrado no banco!')
    }
    
    return allFlashcards
  } catch (error) {
    console.error('❌ Erro ao debugar flashcards:', error)
    return []
  }
}
