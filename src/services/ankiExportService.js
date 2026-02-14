import JSZip from 'jszip/dist/jszip.min.js'

class AnkiExportService {
  static async exportToAnki(flashcards, deckName = 'FlashConCards') {
    try {
      // Formatar flashcards para o formato Anki
      const ankiNotes = flashcards.map((card, index) => {
        const note = {
          guid: `flashcard_${card.id}_${index}`,
          model: 'Basic',
          fields: {
            Front: this.cleanField(card.pergunta),
            Back: this.cleanField(card.resposta)
          },
          tags: this.formatTags(card.tags, card.materia, card.modulo)
        }
        return note
      })

      // Gerar arquivo de texto simples
      const apkgContent = await this.generateAPKG(ankiNotes, deckName)
      
      // Download do arquivo com nome claro
      this.downloadFile(apkgContent, `${deckName}_flashcards_anki.txt`)
      
      return { success: true, count: ankiNotes.length }
    } catch (error) {
      console.error('Erro ao exportar para Anki:', error)
      return { success: false, error: error.message }
    }
  }

  static cleanField(text) {
    if (!text) return ''
    // Limpar HTML e caracteres especiais
    return text
      .replace(/<[^>]*>/g, '') // Remover HTML
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n/g, '<br>') // Converter quebras de linha
      .trim()
  }

  static formatTags(tags, materia, modulo) {
    const tagList = []
    
    // Adicionar tags existentes
    if (tags && Array.isArray(tags)) {
      tagList.push(...tags.filter(tag => tag && tag.trim()))
    }
    
    // Adicionar matéria e módulo como tags
    if (materia) {
      tagList.push(this.sanitizeTag(materia))
    }
    
    if (modulo && modulo !== 'Geral') {
      tagList.push(this.sanitizeTag(modulo))
    }
    
    // Remover duplicatas
    return [...new Set(tagList)].join(' ')
  }

  static sanitizeTag(tag) {
    return tag
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .trim()
  }

  static async generateAPKG(notes, deckName) {
    // Criar formato simples de texto para importação no Anki
    const textContent = notes.map(note => {
      const front = this.cleanField(note.fields.Front)
      const back = this.cleanField(note.fields.Back)
      const tags = note.tags || ''
      
      return `${front}\t${back}\t${tags}`
    }).join('\n')

    // Criar arquivo de texto simples (mais compatível)
    const blob = new Blob([textContent], { 
      type: 'text/plain;charset=utf-8' 
    })
    
    return blob
  }

  static downloadFile(content, filename) {
    const url = URL.createObjectURL(content)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  static async exportToText(flashcards) {
    try {
      // Formato texto simples (Front/Back)
      const textContent = flashcards.map(card => {
        const front = this.cleanField(card.pergunta)
        const back = this.cleanField(card.resposta)
        const tags = this.formatTags(card.tags, card.materia, card.modulo)
        
        return `Front: ${front}\nBack: ${back}\nTags: ${tags}\n---`
      }).join('\n\n')

      this.downloadFile(
        new Blob([textContent], { type: 'text/plain;charset=utf-8' }),
        'flashcards_anki.txt'
      )
      
      return { success: true, count: flashcards.length }
    } catch (error) {
      console.error('Erro ao exportar para texto:', error)
      return { success: false, error: error.message }
    }
  }
}

export default AnkiExportService
