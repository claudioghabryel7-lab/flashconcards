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

      // Gerar arquivo .apkg
      const apkgContent = await this.generateAPKG(ankiNotes, deckName)
      
      // Download do arquivo
      this.downloadFile(apkgContent, `${deckName}.apkg`)
      
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
    const zip = new JSZip()
    
    // Criar arquivo media (vazio para cards básicos)
    zip.file('media', '')
    
    // Criar arquivo collection.anki2
    const collection = {
      config: {
        collapseTime: 100,
        creationOffset: 0,
        curModel: null,
      },
      decks: [
        {
          id: 1,
          name: deckName,
          desc: 'Exportado do FlashConCards',
          collapsed: false,
          conf: 1,
          browserCollapsed: false,
          dyn: 0,
          usn: -1,
          common: {
            active: 1,
            'new': {
              perDay: 20,
              bury: true,
              delays: [1, 6, 10, 15, 20, 25],
              ints: [1, 4, 7],
              initialFactor: 2500,
              maxFactor: 13000,
              separate: true,
              hardFactor: 1.3,
              easyFactor: 1.3,
              minFactor: 1300,
              maxIvl: 36500,
            },
            rev: {
              perDay: 100,
              bury: true,
              ivlFct: 3,
              maxIvl: 36500,
              ease4: 1.3,
              factor: 2.5,
              minFactor: 1300,
            },
            lapse: {
              minIvl: 1,
              leechAction: 0,
              leechFails: 8,
              mult: 0,
              delays: [10],
            },
          },
        }
      ],
      models: [
        {
          id: 1485022299701,
          name: 'Basic',
          flds: [
            { name: 'Front', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20 },
            { name: 'Back', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 20 }
          ],
          tmpls: [
            {
              name: 'Card 1',
              ord: 0,
              qfmt: '{{Front}}',
              afmt: '{{FrontSide}}<hr id=answer>{{Back}}',
              bqfmt: '',
              bafmt: '',
              did: null,
              bfont: '',
              bsize: 0
            }
          ],
          css: '.card {\n font-family: arial;\n font-size: 20px;\n text-align: center;\n color: black;\n background-color: white;\n}\n',
          did: 1,
          usn: -1,
          mtime: 1485022299701,
          vers: []
        }
      ],
      notes: notes.map(note => ({
        id: note.guid,
        guid: note.guid,
        mid: 1485022299701,
        mod: Date.now(),
        usn: -1,
        type: 0,
        queue: 0,
        due: 0,
        ivl: 0,
        factor: 0,
        reps: 0,
        lapses: 0,
        left: 0,
        flds: [note.fields.Front, note.fields.Back],
        flags: 0,
        data: '',
        tags: note.tags
      }))
    }

    zip.file('collection.anki2', JSON.stringify(collection))
    
    return await zip.generateAsync({ type: 'blob' })
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
