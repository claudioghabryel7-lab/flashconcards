import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

/**
 * Sistema de Cache de Leis
 * Armazena textos oficiais de leis para reutilização
 */

// Estrutura do cache:
// /leisCache/
//   /L13869/
//     numero: "13.869/2019"
//     nome: "Lei de Abuso de Autoridade"
//     texto: "texto completo..."
//     fonte: "https://planalto.gov.br/..."
//     dataAtualizacao: timestamp
//     usos: 15
//     versao: "oficial"

export const lawsCache = {
  /**
   * Verifica se uma lei está no cache
   * @param {string} lawIdentifier - Identificador da lei (ex: "13.869/2019", "L13869")
   * @returns {Promise<Object|null>} - Dados da lei ou null se não encontrada
   */
  async getLaw(lawIdentifier) {
    try {
      // Normaliza identificador
      const normalizedId = this.normalizeLawId(lawIdentifier);
      const lawDoc = doc(db, 'leisCache', normalizedId);
      const lawSnapshot = await getDoc(lawDoc);
      
      if (lawSnapshot.exists()) {
        const lawData = lawSnapshot.data();
        
        // Incrementa contador de usos
        await this.incrementUsage(normalizedId);
        
        console.log(`✅ Lei ${normalizedId} encontrada no cache (${lawData.usos + 1} usos)`);
        return lawData;
      }
      
      console.log(`❌ Lei ${normalizedId} não encontrada no cache`);
      return null;
    } catch (error) {
      console.error('Erro ao buscar lei no cache:', error);
      return null;
    }
  },

  /**
   * Salva uma lei no cache
   * @param {string} lawIdentifier - Identificador da lei
   * @param {Object} lawData - Dados da lei
   * @returns {Promise<boolean>} - True se salvo com sucesso
   */
  async saveLaw(lawIdentifier, lawData) {
    try {
      const normalizedId = this.normalizeLawId(lawIdentifier);
      const lawDoc = doc(db, 'leisCache', normalizedId);
      
      const lawToSave = {
        ...lawData,
        id: normalizedId,
        dataAtualizacao: serverTimestamp(),
        usos: 0,
        versao: 'oficial'
      };
      
      await setDoc(lawDoc, lawToSave);
      console.log(`💾 Lei ${normalizedId} salva no cache`);
      return true;
    } catch (error) {
      console.error('Erro ao salvar lei no cache:', error);
      return false;
    }
  },

  /**
   * Incrementa contador de usos de uma lei
   * @param {string} lawId - ID normalizado da lei
   */
  async incrementUsage(lawId) {
    try {
      const lawDoc = doc(db, 'leisCache', lawId);
      const lawSnapshot = await getDoc(lawDoc);
      
      if (lawSnapshot.exists()) {
        const currentData = lawSnapshot.data();
        await setDoc(lawDoc, {
          ...currentData,
          usos: (currentData.usos || 0) + 1,
          ultimoUso: serverTimestamp()
        }, { merge: true });
      }
    } catch (error) {
      console.error('Erro ao incrementar uso:', error);
    }
  },

  /**
   * Normaliza identificador de lei para formato padrão
   * @param {string} identifier - Identificador original
   * @returns {string} - ID normalizado
   */
  normalizeLawId(identifier) {
    // Remove espaços e caracteres especiais
    let normalized = identifier.trim().toUpperCase();
    
    // Remove "LEI" se existir
    normalized = normalized.replace(/^LEI\s+/i, '');
    
    // Remove ponto e barras extras
    normalized = normalized.replace(/[^\d\/]/g, '');
    
    // Formata como LXXXXX
    if (normalized.includes('/')) {
      const parts = normalized.split('/');
      normalized = 'L' + parts[0];
    } else if (normalized.startsWith('L')) {
      normalized = normalized;
    } else {
      normalized = 'L' + normalized;
    }
    
    return normalized;
  },

  /**
   * Lista todas as leis em cache (para admin)
   * @returns {Promise<Array>} - Array com dados das leis
   */
  async listCachedLaws() {
    try {
      // Implementar query para listar todos os documentos
      // Por enquanto retorna array vazio
      console.log('📋 Listando leis em cache...');
      return [];
    } catch (error) {
      console.error('Erro ao listar leis:', error);
      return [];
    }
  }
};

export default lawsCache;
