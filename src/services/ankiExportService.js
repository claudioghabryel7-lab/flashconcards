import JSZip from 'jszip/dist/jszip.min.js'

class AnkiExportService {
  static async exportToAnki(flashcards, deckName = 'FlashConCards') {
    try {
      console.log('🚀 Iniciando exportação para Anki...')
      console.log('📊 Flashcards para exportar:', flashcards.length)
      
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

      console.log('📝 Notas formatadas:', ankiNotes.length)

      // Gerar arquivo de texto simples
      const apkgContent = await this.generateAPKG(ankiNotes, deckName)
      console.log('📦 Conteúdo gerado, tamanho:', apkgContent.size)
      
      // Download do arquivo com nome claro
      const filename = `${deckName}_flashcards.apkg`
      console.log('📥 Iniciando download:', filename)
      this.downloadFile(apkgContent, filename)
      
      return { success: true, count: ankiNotes.length }
    } catch (error) {
      console.error('❌ Erro ao exportar para Anki:', error)
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
    try {
      console.log('🔧 Gerando APKG com', notes.length, 'cards')
      
      const zip = new JSZip()
      
      // Criar arquivo media (vazio para cards básicos)
      zip.file('media', '1\t\n') // Formato: media_id\tfilename\n
      
      // Criar collection.anki2 com estrutura simplificada
      const collection = {
        config: {
          collapseTime: 100,
          creationOffset: 0,
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
            css: '.card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }',
            did: 1,
            usn: -1,
            mtime: 1485022299701,
            vers: []
          }
        ],
        notes: notes.map((note, index) => ({
          id: Date.now() + index, // ID único
          guid: note.guid,
          mid: 1485022299701, // ID do modelo Basic
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
          flds: JSON.stringify([note.fields.Front, note.fields.Back]), // Importante: como string JSON
          flags: 0,
          data: '',
          tags: note.tags || ''
        }))
      }

      // Adicionar collection ao zip
      zip.file('collection.anki2', JSON.stringify(collection))
      
      console.log('📦 ZIP criado com collection e media')
      
      // Gerar blob do APKG
      const apkgBlob = await zip.generateAsync({ type: 'blob' })
      console.log('🗜️ APKG gerado, tamanho:', apkgBlob.size)
      
      return apkgBlob
    } catch (error) {
      console.error('❌ Erro ao gerar APKG:', error)
      throw error
    }
  }

  static downloadFile(content, filename) {
    try {
      console.log('📥 Iniciando download do arquivo...')
      console.log('📁 Nome do arquivo:', filename)
      console.log('📦 Tipo do conteúdo:', content.type)
      console.log('📏 Tamanho:', content.size, 'bytes')
      
      // Criar URL do objeto
      const url = URL.createObjectURL(content)
      console.log('🔗 URL criada:', url.substring(0, 50) + '...')
      
      // Criar link de download
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.style.display = 'none'
      
      // Adicionar ao DOM
      document.body.appendChild(link)
      console.log('✅ Link adicionado ao DOM')
      
      // Disparar clique
      link.click()
      console.log('🖱️ Clique no link disparado')
      
      // Limpar
      setTimeout(() => {
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        console.log('🧹 Link e URL limpos')
      }, 100)
      
      console.log('✅ Download iniciado com sucesso!')
    } catch (error) {
      console.error('❌ Erro no download:', error)
      throw error
    }
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
