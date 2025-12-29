import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit } from 'firebase/firestore'
import { db } from '../firebase/config'

// Hook para buscar artigos com React Query
export const useArticles = (category = 'TODAS', searchTerm = '', isAdmin = false) => {
  return useQuery({
    queryKey: ['articles', category, searchTerm, isAdmin],
    queryFn: async () => {
      if (!db) return []
      
      const articlesRef = collection(db, 'blog_articles')
      let q
      
      try {
        // Para evitar problemas de índice composto, vamos buscar todos os artigos
        // SEM usar orderBy na query - toda ordenação será feita no cliente
        let q
        
        if (isAdmin) {
          // Admin pode ver todos os artigos
          if (category !== 'TODAS') {
            // Buscar por categoria apenas (sem orderBy para evitar índice composto)
            q = query(articlesRef, where('category', '==', category))
          } else {
            // Buscar todos sem orderBy - ordenaremos no cliente
            q = query(articlesRef)
          }
        } else {
          // Usuários não logados: buscar apenas por status publicado
          // SEM orderBy para evitar índice composto - ordenaremos no cliente
          q = query(
            articlesRef,
            where('status', '==', 'published')
          )
        }
        
        const snapshot = await getDocs(q)
        let data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        
        // Filtrar por categoria no cliente (se necessário) para evitar índice composto
        if (category !== 'TODAS') {
          data = data.filter(article => article.category === category)
        }
        
        // Filtrar por status (client-side para evitar problemas de índice)
        if (!isAdmin) {
          data = data.filter(article => {
            if (article.status === 'published') return true
            if (article.status === 'scheduled') {
              const scheduled = article.scheduledAt?.toDate?.()
              return scheduled && scheduled <= new Date()
            }
            return false
          })
        }
        
        // Filtrar por busca
        if (searchTerm) {
          const search = searchTerm.toLowerCase()
          data = data.filter(article =>
            article.title?.toLowerCase().includes(search) ||
            article.excerpt?.toLowerCase().includes(search) ||
            article.content?.toLowerCase().includes(search) ||
            article.tags?.some(tag => tag.toLowerCase().includes(search))
          )
        }
        
        // Ordenar por data
        data.sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || a.updatedAt?.toDate?.() || new Date(0)
          const dateB = b.createdAt?.toDate?.() || b.updatedAt?.toDate?.() || new Date(0)
          return dateB.getTime() - dateA.getTime()
        })
        
        return data
      } catch (error) {
        console.error('Erro ao buscar artigos:', error)
        return []
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutos
    gcTime: 10 * 60 * 1000, // 10 minutos (cacheTime foi renomeado para gcTime na v5)
  })
}

// Hook para buscar um artigo específico
export const useArticle = (articleId) => {
  return useQuery({
    queryKey: ['article', articleId],
    queryFn: async () => {
      if (!db || !articleId) return null
      
      try {
        const articleRef = doc(db, 'blog_articles', articleId)
        const snap = await getDoc(articleRef)
        
        if (!snap.exists()) return null
        
        const data = snap.data()
        
        // Verificar se está publicado
        if (data.status !== 'published') {
          return null
        }
        
        return {
          id: snap.id,
          ...data,
        }
      } catch (error) {
        console.error('Erro ao buscar artigo:', error)
        return null
      }
    },
    enabled: !!articleId,
    staleTime: 5 * 60 * 1000, // 5 minutos
  })
}

