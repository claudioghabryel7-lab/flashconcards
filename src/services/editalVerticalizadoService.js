import { collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where, orderBy, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'

// Coleção para edital verticalizado
const EDITAL_COLLECTION = 'editalVerticalizado'

// Serviço para gerenciar edital verticalizado
export const editalVerticalizadoService = {
  // Criar uma nova matéria no edital
  async createMateria(materiaData) {
    try {
      const materiaRef = collection(db, EDITAL_COLLECTION)
      const newMateria = {
        type: 'materia',
        nome: materiaData.nome,
        descricao: materiaData.descricao || '',
        ordem: materiaData.ordem || 0,
        ativo: materiaData.ativo !== false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
      
      const docRef = await addDoc(materiaRef, newMateria)
      return { id: docRef.id, ...newMateria }
    } catch (error) {
      console.error('Erro ao criar matéria:', error)
      throw error
    }
  },

  // Criar um novo tópico dentro de uma matéria
  async createTopico(materiaId, topicoData) {
    try {
      const topicosRef = collection(db, EDITAL_COLLECTION)
      const newTopico = {
        type: 'topico',
        materiaId: materiaId,
        nome: topicoData.nome,
        descricao: topicoData.descricao || '',
        conteudo: topicoData.conteudo || '',
        ordem: topicoData.ordem || 0,
        ativo: topicoData.ativo !== false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
      
      const docRef = await addDoc(topicosRef, newTopico)
      return { id: docRef.id, ...newTopico }
    } catch (error) {
      console.error('Erro ao criar tópico:', error)
      throw error
    }
  },

  // Obter todas as matérias do edital
  async getMaterias() {
    try {
      const q = query(
        collection(db, EDITAL_COLLECTION),
        where('type', '==', 'materia'),
        orderBy('ordem', 'asc')
      )
      
      const querySnapshot = await getDocs(q)
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    } catch (error) {
      console.error('Erro ao obter matérias:', error)
      throw error
    }
  },

  // Obter todos os tópicos de uma matéria
  async getTopicos(materiaId) {
    try {
      const q = query(
        collection(db, EDITAL_COLLECTION),
        where('type', '==', 'topico'),
        where('materiaId', '==', materiaId),
        orderBy('ordem', 'asc')
      )
      
      const querySnapshot = await getDocs(q)
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    } catch (error) {
      console.error('Erro ao obter tópicos:', error)
      throw error
    }
  },

  // Obter todo o edital (matérias + tópicos)
  async getEditalCompleto() {
    try {
      const materias = await this.getMaterias()
      const editalCompleto = []

      for (const materia of materias) {
        const topicos = await this.getTopicos(materia.id)
        editalCompleto.push({
          ...materia,
          topicos
        })
      }

      return editalCompleto
    } catch (error) {
      console.error('Erro ao obter edital completo:', error)
      throw error
    }
  },

  // Atualizar uma matéria
  async updateMateria(materiaId, updateData) {
    try {
      const materiaRef = doc(db, EDITAL_COLLECTION, materiaId)
      await updateDoc(materiaRef, {
        ...updateData,
        updatedAt: serverTimestamp()
      })
      
      return await this.getItem(materiaId)
    } catch (error) {
      console.error('Erro ao atualizar matéria:', error)
      throw error
    }
  },

  // Atualizar um tópico
  async updateTopico(topicoId, updateData) {
    try {
      const topicoRef = doc(db, EDITAL_COLLECTION, topicoId)
      await updateDoc(topicoRef, {
        ...updateData,
        updatedAt: serverTimestamp()
      })
      
      return await this.getItem(topicoId)
    } catch (error) {
      console.error('Erro ao atualizar tópico:', error)
      throw error
    }
  },

  // Excluir uma matéria (e todos seus tópicos)
  async deleteMateria(materiaId) {
    try {
      // Primeiro, excluir todos os tópicos da matéria
      const topicos = await this.getTopicos(materiaId)
      for (const topico of topicos) {
        await this.deleteTopico(topico.id)
      }

      // Depois, excluir a matéria
      const materiaRef = doc(db, EDITAL_COLLECTION, materiaId)
      await deleteDoc(materiaRef)
      
      return true
    } catch (error) {
      console.error('Erro ao excluir matéria:', error)
      throw error
    }
  },

  // Excluir um tópico
  async deleteTopico(topicoId) {
    try {
      const topicoRef = doc(db, EDITAL_COLLECTION, topicoId)
      await deleteDoc(topicoRef)
      return true
    } catch (error) {
      console.error('Erro ao excluir tópico:', error)
      throw error
    }
  },

  // Obter um item específico (matéria ou tópico)
  async getItem(itemId) {
    try {
      const itemRef = doc(db, EDITAL_COLLECTION, itemId)
      const itemSnap = await getDoc(itemRef)
      
      if (itemSnap.exists()) {
        return { id: itemSnap.id, ...itemSnap.data() }
      }
      return null
    } catch (error) {
      console.error('Erro ao obter item:', error)
      throw error
    }
  },

  // Reordenar matérias
  async reorderMaterias(materiasOrdenadas) {
    try {
      const batch = materiasOrdenadas.map((materia, index) => 
        this.updateMateria(materia.id, { ordem: index })
      )
      
      await Promise.all(batch)
      return true
    } catch (error) {
      console.error('Erro ao reordenar matérias:', error)
      throw error
    }
  },

  // Reordenar tópicos de uma matéria
  async reorderTopicos(materiaId, topicosOrdenados) {
    try {
      const batch = topicosOrdenados.map((topico, index) => 
        this.updateTopico(topico.id, { ordem: index })
      )
      
      await Promise.all(batch)
      return true
    } catch (error) {
      console.error('Erro ao reordenar tópicos:', error)
      throw error
    }
  },

  // Duplicar uma matéria com seus tópicos
  async duplicateMateria(materiaId, novoNome) {
    try {
      const materiaOriginal = await this.getItem(materiaId)
      if (!materiaOriginal || materiaOriginal.type !== 'materia') {
        throw new Error('Matéria não encontrada')
      }

      const topicosOriginais = await this.getTopicos(materiaId)

      // Criar nova matéria
      const novaMateria = await this.createMateria({
        nome: novoNome,
        descricao: materiaOriginal.descricao,
        ordem: materiaOriginal.ordem + 1,
        ativo: false // Criar como inativa por padrão
      })

      // Duplicar todos os tópicos
      for (const topicoOriginal of topicosOriginais) {
        await this.createTopico(novaMateria.id, {
          nome: topicoOriginal.nome,
          descricao: topicoOriginal.descricao,
          conteudo: topicoOriginal.conteudo,
          ordem: topicoOriginal.ordem,
          ativo: false
        })
      }

      return novaMateria
    } catch (error) {
      console.error('Erro ao duplicar matéria:', error)
      throw error
    }
  },

  // Importar edital de um arquivo JSON
  async importFromJSON(editalData) {
    try {
      const results = {
        materiasCriadas: 0,
        topicosCriados: 0,
        erros: []
      }

      for (const materiaData of editalData.materias || []) {
        try {
          const novaMateria = await this.createMateria({
            nome: materiaData.nome,
            descricao: materiaData.descricao || '',
            ordem: materiaData.ordem || 0,
            ativo: materiaData.ativo !== false
          })
          results.materiasCriadas++

          // Importar tópicos da matéria
          for (const topicoData of materiaData.topicos || []) {
            try {
              await this.createTopico(novaMateria.id, {
                nome: topicoData.nome,
                descricao: topicoData.descricao || '',
                conteudo: topicoData.conteudo || '',
                ordem: topicoData.ordem || 0,
                ativo: topicoData.ativo !== false
              })
              results.topicosCriados++
            } catch (topicoError) {
              results.erros.push(`Erro ao criar tópico "${topicoData.nome}": ${topicoError.message}`)
            }
          }
        } catch (materiaError) {
          results.erros.push(`Erro ao criar matéria "${materiaData.nome}": ${materiaError.message}`)
        }
      }

      return results
    } catch (error) {
      console.error('Erro ao importar edital:', error)
      throw error
    }
  },

  // Exportar edital para JSON
  async exportToJSON() {
    try {
      const editalCompleto = await this.getEditalCompleto()
      
      const exportData = {
        versao: '1.0',
        dataExportacao: new Date().toISOString(),
        materias: editalCompleto.map(materia => ({
          nome: materia.nome,
          descricao: materia.descricao,
          ordem: materia.ordem,
          ativo: materia.ativo,
          topicos: materia.topicos.map(topico => ({
            nome: topico.nome,
            descricao: topico.descricao,
            conteudo: topico.conteudo,
            ordem: topico.ordem,
            ativo: topico.ativo
          }))
        }))
      }

      return exportData
    } catch (error) {
      console.error('Erro ao exportar edital:', error)
      throw error
    }
  }
}
