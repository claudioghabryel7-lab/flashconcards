import { useState } from 'react'
import { ArrowDownTrayIcon, DocumentArrowDownIcon } from '@heroicons/react/24/outline'
import AnkiExportService from '../services/ankiExportService'
import { userFlashcardsService } from '../services/userFlashcardsService'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'

const AnkiExportButton = ({ 
  selectedMateria = null, 
  selectedModulo = null,
  selectedCourseId = null,
  className = '',
  variant = 'primary' // primary, secondary, text
}) => {
  const { user } = useAuth()
  const { darkMode } = useDarkMode()
  const [isExporting, setIsExporting] = useState(false)
  const [exportResult, setExportResult] = useState(null)

  const handleExport = async (format = 'apkg') => {
    if (!user) {
      alert('Faça login para exportar flashcards')
      return
    }

    setIsExporting(true)
    setExportResult(null)

    try {
      console.log('🚀 Iniciando exportação para Anki...')
      console.log('📋 Filtros:', { selectedMateria, selectedModulo, selectedCourseId })
      
      let flashcards
      
      // Se há filtros de matéria/módulo, usar a nova função
      if (selectedMateria || selectedModulo) {
        console.log('📚 Usando busca por matéria/módulo...')
        flashcards = await userFlashcardsService.getFlashcardsByMateriaModulo(
          selectedMateria, 
          selectedModulo,
          selectedCourseId
        )
      } else {
        // Senão, buscar flashcards do usuário
        console.log('👤 Usando busca por usuário...')
        flashcards = await userFlashcardsService.getUserFlashcards(user.uid, selectedCourseId)
      }
      
      console.log('📝 Flashcards encontrados:', flashcards.length)
      
      // Filtrar adicionalmente se necessário (para garantir compatibilidade)
      const filteredFlashcards = flashcards.filter(card => {
        if (selectedMateria && card.materia !== selectedMateria && !card.materia?.includes(selectedMateria)) return false
        if (selectedModulo && card.modulo !== selectedModulo && !card.modulo?.includes(selectedModulo)) return false
        return true
      })
      
      console.log('📊 Flashcards filtrados:', filteredFlashcards.length)
      console.log('📋 Amostra de flashcards:', filteredFlashcards.slice(0, 2))

      if (filteredFlashcards.length === 0) {
        setExportResult({ 
          success: false, 
          message: 'Nenhum flashcard encontrado para exportar' 
        })
        return
      }

      let result
      const deckName = selectedMateria || 'FlashConCards'
      
      if (format === 'apkg') {
        result = await AnkiExportService.exportToAnki(filteredFlashcards, deckName)
      } else {
        result = await AnkiExportService.exportToText(filteredFlashcards)
      }

      setExportResult(result)
    } catch (error) {
      console.error('❌ Erro na exportação:', error)
      setExportResult({ 
        success: false, 
        message: `Erro ao exportar flashcards: ${error.message}` 
      })
    } finally {
      setIsExporting(false)
    }
  }

  const getButtonStyles = () => {
    const baseStyles = 'inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200'
    
    switch (variant) {
      case 'primary':
        return `${baseStyles} bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl`
      case 'secondary':
        return `${baseStyles} bg-slate-600 hover:bg-slate-700 text-white shadow-lg hover:shadow-xl`
      case 'text':
        return `${baseStyles} text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20`
      default:
        return `${baseStyles} bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl`
    }
  }

  return (
    <div className={`relative ${className}`}>
      <div className="flex gap-2">
        {/* Botão principal - Exportar APKG */}
        <button
          onClick={() => handleExport('apkg')}
          disabled={isExporting}
          className={getButtonStyles()}
        >
          {isExporting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              <span>Exportando...</span>
            </>
          ) : (
            <>
              <ArrowDownTrayIcon className="h-4 w-4" />
              <span>Exportar para Anki</span>
            </>
          )}
        </button>

        {/* Botão secundário - Exportar Texto */}
        <button
          onClick={() => handleExport('text')}
          disabled={isExporting}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-200"
          title="Exportar como arquivo de texto"
        >
          <DocumentArrowDownIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Mensagem de resultado */}
      {exportResult && (
        <div className={`absolute top-full mt-2 left-0 right-0 p-3 rounded-lg text-sm font-medium ${
          exportResult.success 
            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400 border border-green-200 dark:border-green-800' 
            : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-800'
        }`}>
          {exportResult.success 
            ? (
              <div>
                <div className="font-semibold mb-1">✅ {exportResult.count} flashcards exportados!</div>
                <div className="text-xs opacity-80">
                  <div className="mb-1">📁 Arquivo: {selectedMateria ? `${selectedMateria}_flashcards.txt` : 'FlashConCards_flashcards.txt'}</div>
                  <div className="mb-1">📥 Para importar no Anki:</div>
                  <div className="ml-2">1. Abra o Anki</div>
                  <div className="ml-2">2. Arquivo → Importar</div>
                  <div className="ml-2">3. Selecione o arquivo .txt</div>
                  <div className="ml-2">4. Tipo: Campo separado por Tabulação</div>
                  <div className="ml-2">5. Mapear: Campo 1 → Frente, Campo 2 → Verso</div>
                  <div className="ml-2">6. Importar</div>
                </div>
              </div>
            ) 
            : `❌ ${exportResult.message}`
          }
        </div>
      )}

      {/* Informações */}
      <div className="absolute bottom-full mb-2 left-0 right-0 p-3 bg-slate-800 text-white text-xs rounded-lg opacity-0 hover:opacity-100 transition-opacity duration-200 pointer-events-none">
        <div className="font-semibold mb-1">Exportar para Anki</div>
        <div className="text-slate-300">
          • Formato APKG - Importe diretamente no Anki<br/>
          • Formato TXT - Importação manual<br/>
          • Inclui tags de matéria e módulo
        </div>
      </div>
    </div>
  )
}

export default AnkiExportButton
