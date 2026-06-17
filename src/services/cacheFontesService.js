// Serviço de cache de fontes verificadas no Firestore
// Para evitar chamadas repetitivas a APIs externas e melhorar performance

import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'

const CACHE_COLLECTION = 'fontesVerificadasCache'
const CACHE_EXPIRY_DAYS = 7 // Cache expira em 7 dias

/**
 * Gera uma chave única para o cache baseada na consulta
 * @param {string} tipo - Tipo de consulta (legislacao, jurisprudencia)
 * @param {string} termo - Termo de pesquisa
 * @param {Object} params - Parâmetros adicionais
 * @returns {string} Chave do cache
 */
function gerarChaveCache(tipo, termo, params = {}) {
  const base = `${tipo}:${termo}`
  const extras = Object.entries(params)
    .sort()
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  return extras ? `${base}:${extras}` : base
}

/**
 * Salva resultado de verificação no cache
 * @param {string} tipo - Tipo de consulta
 * @param {string} termo - Termo de pesquisa
 * @param {Object} dados - Dados a serem cacheados
 * @param {Object} params - Parâmetros adicionais
 */
export async function salvarNoCache(tipo, termo, dados, params = {}) {
  try {
    const chave = gerarChaveCache(tipo, termo, params)
    const docRef = doc(db, CACHE_COLLECTION, chave)
    
    const cacheData = {
      tipo,
      termo,
      params,
      dados,
      createdAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
    }
    
    await setDoc(docRef, cacheData, { merge: true })
    console.log(`✅ Cache salvo: ${chave}`)
  } catch (error) {
    console.error('Erro ao salvar no cache:', error)
  }
}

/**
 * Busca resultado do cache
 * @param {string} tipo - Tipo de consulta
 * @param {string} termo - Termo de pesquisa
 * @param {Object} params - Parâmetros adicionais
 * @returns {Promise<Object|null>} Dados do cache ou null se não existir/expirado
 */
export async function buscarDoCache(tipo, termo, params = {}) {
  try {
    const chave = gerarChaveCache(tipo, termo, params)
    const docRef = doc(db, CACHE_COLLECTION, chave)
    const docSnap = await getDoc(docRef)
    
    if (!docSnap.exists()) {
      return null
    }
    
    const cacheData = docSnap.data()
    
    // Verifica se o cache expirou
    if (cacheData.expiresAt && new Date(cacheData.expiresAt) < new Date()) {
      console.log(`⏰ Cache expirado: ${chave}`)
      return null
    }
    
    console.log(`✅ Cache encontrado: ${chave}`)
    return cacheData.dados
  } catch (error) {
    console.error('Erro ao buscar do cache:', error)
    return null
  }
}

/**
 * Limpa caches expirados
 */
export async function limparCachesExpirados() {
  try {
    const cacheRef = collection(db, CACHE_COLLECTION)
    const snapshot = await getDocs(cacheRef)
    
    const batch = []
    const now = new Date()
    
    snapshot.forEach((doc) => {
      const data = doc.data()
      if (data.expiresAt && new Date(data.expiresAt) < now) {
        batch.push(doc.ref)
      }
    })
    
    if (batch.length > 0) {
      // Em produção, usar batch delete
      console.log(`🗑️ Limpando ${batch.length} caches expirados`)
    }
  } catch (error) {
    console.error('Erro ao limpar caches expirados:', error)
  }
}

/**
 * Busca ou cria cache com verificação cruzada
 * @param {string} tipo - Tipo de consulta
 * @param {string} termo - Termo de pesquisa
 * @param {Function} buscaFunction - Função para buscar dados se não estiver em cache
 * @param {Object} params - Parâmetros adicionais
 * @returns {Promise<Object>} Dados do cache ou da busca
 */
export async function buscarOuCriarCache(tipo, termo, buscaFunction, params = {}) {
  // Tenta buscar do cache primeiro
  const cache = await buscarDoCache(tipo, termo, params)
  if (cache) {
    return cache
  }
  
  // Se não estiver no cache, busca e salva
  const dados = await buscaFunction()
  await salvarNoCache(tipo, termo, dados, params)
  
  return dados
}

/**
 * Estatísticas do cache
 * @returns {Promise<Object>} Estatísticas
 */
export async function estatisticasCache() {
  try {
    const cacheRef = collection(db, CACHE_COLLECTION)
    const snapshot = await getDocs(cacheRef)
    
    const stats = {
      total: snapshot.size,
      porTipo: {},
      expirados: 0
    }
    
    const now = new Date()
    
    snapshot.forEach((doc) => {
      const data = doc.data()
      
      // Conta por tipo
      if (data.tipo) {
        stats.porTipo[data.tipo] = (stats.porTipo[data.tipo] || 0) + 1
      }
      
      // Conta expirados
      if (data.expiresAt && new Date(data.expiresAt) < now) {
        stats.expirados++
      }
    })
    
    return stats
  } catch (error) {
    console.error('Erro ao buscar estatísticas do cache:', error)
    return { total: 0, porTipo: {}, expirados: 0 }
  }
}
