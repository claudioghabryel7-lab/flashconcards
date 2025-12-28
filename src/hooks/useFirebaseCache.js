import { useState, useEffect, useRef } from 'react'
import { collection, onSnapshot, query, limit, getDocs } from 'firebase/firestore'

const CACHE_PREFIX = 'firebase_cache_'
// Tempos de cache otimizados por tipo de dados (melhor TTFB)
const CACHE_EXPIRY = {
  courses: 24 * 60 * 60 * 1000, // 24 horas (para funcionar offline)
  flashcards: 24 * 60 * 60 * 1000, // 24 horas (para funcionar offline)
  users: 2 * 60 * 1000, // 2 minutos (dados mais dinâmicos)
  default: 24 * 60 * 60 * 1000, // 24 horas padrão (para funcionar offline)
}

// Função para salvar no cache
const saveToCache = (key, data) => {
  try {
    // Não salvar cursos completos (são muito grandes e causam quota excedida)
    // Cursos podem ter imagens base64 e outros dados grandes
    if (key.includes('courses') || key.includes('course') || key === 'courses') {
      console.warn('Cursos não são salvos no cache local devido ao tamanho. Use apenas para dados essenciais.')
      return // Não salvar cursos no localStorage
    }
    
    const cacheData = {
      data,
      timestamp: Date.now(),
    }
    
    // Tentar salvar normalmente
    try {
      localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(cacheData))
    } catch (quotaError) {
      if (quotaError.name === 'QuotaExceededError') {
        console.warn(`Quota excedida ao salvar ${key}. Tentando limpar cache antigo...`)
        
        // Tentar limpar caches antigos
        try {
          const keysToRemove = []
          for (let i = 0; i < localStorage.length; i++) {
            const storedKey = localStorage.key(i)
            if (storedKey && storedKey.startsWith(CACHE_PREFIX)) {
              try {
                const stored = localStorage.getItem(storedKey)
                if (stored) {
                  const { timestamp } = JSON.parse(stored)
                  // Remover caches com mais de 7 dias
                  if (Date.now() - timestamp > 7 * 24 * 60 * 60 * 1000) {
                    keysToRemove.push(storedKey)
                  }
                }
              } catch (e) {
                // Se não conseguir parsear, remove
                keysToRemove.push(storedKey)
              }
            }
          }
          
          // Remover caches antigos
          keysToRemove.forEach(k => localStorage.removeItem(k))
          
          // Tentar salvar novamente
          if (keysToRemove.length > 0) {
            localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(cacheData))
            console.log(`Cache limpo. ${keysToRemove.length} entradas antigas removidas.`)
          } else {
            console.warn(`Não foi possível salvar ${key}. Cache cheio e nenhum item antigo para remover.`)
          }
        } catch (cleanError) {
          console.error('Erro ao limpar cache:', cleanError)
        }
      } else {
        throw quotaError
      }
    }
  } catch (err) {
    console.warn(`Erro ao salvar no cache (${key}):`, err)
  }
}

// Função para ler do cache com TTL inteligente
const getFromCache = (key, collectionName = null) => {
  try {
    const cached = localStorage.getItem(`${CACHE_PREFIX}${key}`)
    if (!cached) return null
    
    const { data, timestamp } = JSON.parse(cached)
    const now = Date.now()
    
    // Determinar TTL baseado no tipo de coleção
    const ttl = collectionName && CACHE_EXPIRY[collectionName] 
      ? CACHE_EXPIRY[collectionName] 
      : CACHE_EXPIRY.default
    
    // Verificar se o cache expirou
    if (now - timestamp > ttl) {
      localStorage.removeItem(`${CACHE_PREFIX}${key}`)
      return null
    }
    
    return data
  } catch (err) {
    console.warn('Erro ao ler do cache:', err)
    return null
  }
}

// Hook para carregar dados do Firebase com cache
export const useFirebaseCache = (collectionName, queryOptions = {}, dependencies = []) => {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const retryCount = useRef(0)
  const maxRetries = 3

  useEffect(() => {
    if (!collectionName) {
      setLoading(false)
      return
    }

    const cacheKey = `${collectionName}_${JSON.stringify(queryOptions)}`
    
    // Tentar carregar do cache primeiro (melhor TTFB) - mas não para cursos
    let cachedData = null
    if (collectionName !== 'courses') {
      cachedData = getFromCache(cacheKey, collectionName)
      if (cachedData) {
        setData(cachedData)
        setLoading(false) // Não bloquear renderização se tiver cache
      }
    }

    // Carregar do Firebase
    const loadData = async () => {
      try {
        const { db } = require('../firebase/config')
        const collectionRef = collection(db, collectionName)
        
        let q = collectionRef
        if (queryOptions.where) {
          q = query(collectionRef, ...queryOptions.where)
        }
        if (queryOptions.orderBy) {
          q = query(q || collectionRef, ...queryOptions.orderBy)
        }
        if (queryOptions.limit) {
          q = query(q || collectionRef, limit(queryOptions.limit))
        }

        const unsubscribe = onSnapshot(
          q || collectionRef,
          (snapshot) => {
            const newData = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }))
            
            setData(newData)
            setLoading(false)
            setError(null)
            retryCount.current = 0
            
            // Salvar no cache (não salvar cursos)
            if (collectionName !== 'courses') {
              saveToCache(cacheKey, newData)
            }
          },
          (err) => {
            console.error(`Erro ao carregar ${collectionName}:`, err)
            
            // Se tiver cache, usar ele mesmo com erro
            if (cachedData) {
              setData(cachedData)
              setLoading(false)
            } else {
              setError(err)
              setLoading(false)
            }

            // Retry logic
            if (retryCount.current < maxRetries) {
              retryCount.current++
              setTimeout(() => {
                loadData()
              }, 1000 * retryCount.current) // Backoff exponencial
            }
          }
        )

        return () => unsubscribe()
      } catch (err) {
        console.error(`Erro ao configurar listener para ${collectionName}:`, err)
        setError(err)
        setLoading(false)
      }
    }

    const unsubscribe = loadData()
    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [collectionName, ...dependencies])

  return { data, loading, error }
}

// Hook para carregar um documento específico com cache
export const useFirebaseDocCache = (collectionName, docId, dependencies = []) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const retryCount = useRef(0)
  const maxRetries = 3

  useEffect(() => {
    if (!collectionName || !docId) {
      setLoading(false)
      return
    }

    const cacheKey = `${collectionName}_${docId}`
    
    // Tentar carregar do cache primeiro (melhor TTFB)
    const cachedData = getFromCache(cacheKey, collectionName)
    if (cachedData) {
      setData(cachedData)
      setLoading(false) // Não bloquear renderização se tiver cache
    }

    // Carregar do Firebase
    const loadData = async () => {
      try {
        const { doc, onSnapshot, getDoc } = require('firebase/firestore')
        const { db } = require('../firebase/config')
        const docRef = doc(db, collectionName, docId)
        
        const unsubscribe = onSnapshot(
          docRef,
          (snapshot) => {
            if (snapshot.exists()) {
              const newData = {
                id: snapshot.id,
                ...snapshot.data(),
              }
              
              setData(newData)
              setLoading(false)
              setError(null)
              retryCount.current = 0
              
              // Salvar no cache
              saveToCache(cacheKey, newData)
            } else {
              setData(null)
              setLoading(false)
            }
          },
          (err) => {
            console.error(`Erro ao carregar ${collectionName}/${docId}:`, err)
            
            // Se tiver cache, usar ele mesmo com erro
            if (cachedData) {
              setData(cachedData)
              setLoading(false)
            } else {
              setError(err)
              setLoading(false)
            }

            // Retry logic
            if (retryCount.current < maxRetries) {
              retryCount.current++
              setTimeout(() => {
                loadData()
              }, 1000 * retryCount.current)
            }
          }
        )

        return () => unsubscribe()
      } catch (err) {
        console.error(`Erro ao configurar listener para ${collectionName}/${docId}:`, err)
        setError(err)
        setLoading(false)
      }
    }

    const unsubscribe = loadData()
    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [collectionName, docId, ...dependencies])

  return { data, loading, error }
}

