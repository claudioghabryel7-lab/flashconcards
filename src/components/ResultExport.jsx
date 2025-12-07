import { useRef, useEffect, useState } from 'react'
import html2canvas from 'html2canvas'
import { ArrowDownTrayIcon, ShareIcon } from '@heroicons/react/24/outline'

const ResultExport = ({ results, courseName, leadName }) => {
  const exportRef = useRef(null)
  const [exporting, setExporting] = useState(false)

  const exportAsImage = async () => {
    if (!exportRef.current) return

    setExporting(true)
    try {
      const canvas = await html2canvas(exportRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        useCORS: true,
      })

      // Converter para blob e download
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `resultado-simulado-${leadName || 'resultado'}-${Date.now()}.png`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          URL.revokeObjectURL(url)
        }
      }, 'image/png')
    } catch (error) {
      console.error('Erro ao exportar imagem:', error)
      alert('Erro ao exportar resultado. Tente novamente.')
    } finally {
      setExporting(false)
    }
  }

  const shareOnWhatsApp = async () => {
    if (!exportRef.current) return

    setExporting(true)
    try {
      const canvas = await html2canvas(exportRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        useCORS: true,
      })

      canvas.toBlob((blob) => {
        if (blob) {
          // Criar URL temporária
          const url = URL.createObjectURL(blob)
          
          // Criar link de compartilhamento
          const text = `🎉 Concluí o simulado ${courseName || ''}!\n\nNota Final: ${results.finalScore}/1000\n\nConfira meu resultado!`
          const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`
          
          // Abrir WhatsApp (usuário pode anexar imagem manualmente)
          window.open(whatsappUrl, '_blank')
          
          // Também fazer download automático
          const link = document.createElement('a')
          link.href = url
          link.download = `resultado-simulado-${Date.now()}.png`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        }
      }, 'image/png')
    } catch (error) {
      console.error('Erro ao compartilhar:', error)
      alert('Erro ao compartilhar. Tente exportar a imagem primeiro.')
    } finally {
      setExporting(false)
    }
  }

  // Calcular porcentagem de acerto
  const accuracy = results.total > 0 ? ((results.correct / results.total) * 100).toFixed(1) : 0

  return (
    <div className="space-y-4">
      {/* Botões de ação */}
      <div className="flex gap-3">
        <button
          onClick={exportAsImage}
          disabled={exporting}
          className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-xl font-bold hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
        >
          <ArrowDownTrayIcon className="h-5 w-5" />
          {exporting ? 'Exportando...' : 'Exportar Resultado'}
        </button>
        <button
          onClick={shareOnWhatsApp}
          disabled={exporting}
          className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-3 rounded-xl font-bold hover:from-green-700 hover:to-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
        >
          <ShareIcon className="h-5 w-5" />
          Compartilhar
        </button>
      </div>

      {/* Área exportável (oculta visualmente, mas capturável) */}
      <div ref={exportRef} className="hidden">
        <div className="w-[800px] bg-gradient-to-br from-white to-slate-50 p-12">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-4xl mb-4">🎉</div>
            <h1 className="text-3xl font-black text-slate-900 mb-2">
              Parabéns, {leadName || 'Candidato'}!
            </h1>
            <p className="text-lg text-slate-600">
              Resultado do Simulado {courseName || ''}
            </p>
          </div>

          {/* Nota Final */}
          <div className="bg-gradient-to-r from-alego-600 to-alego-700 rounded-2xl p-8 text-white text-center mb-8 shadow-xl">
            <p className="text-sm opacity-90 mb-2">Nota Final</p>
            <p className="text-7xl font-black mb-2">{results.finalScore}</p>
            <p className="text-lg opacity-80">de 10 pontos</p>
            <div className="mt-4 flex justify-center gap-1">
              {[...Array(5)].map((_, i) => (
                <span key={i} className="text-2xl">
                  {i < Math.floor(parseInt(results.finalScore) / 200) ? '⭐' : '☆'}
                </span>
              ))}
            </div>
          </div>

          {/* Estatísticas */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-green-50 rounded-xl p-6 text-center border-2 border-green-200">
              <p className="text-sm text-green-700 mb-1 font-semibold">Nota Objetiva</p>
              <p className="text-4xl font-black text-green-600">{results.objectiveScore}</p>
              <p className="text-xs text-green-600 mt-1">{accuracy}% de acerto</p>
            </div>
            {results.redacao ? (
              <div className="bg-purple-50 rounded-xl p-6 text-center border-2 border-purple-200">
                <p className="text-sm text-purple-700 mb-1 font-semibold">Nota Redação</p>
                <p className="text-4xl font-black text-purple-600">{results.redacao.nota}</p>
                <p className="text-xs text-purple-600 mt-1">de 10 pontos</p>
              </div>
            ) : (
              <div className="bg-slate-100 rounded-xl p-6 text-center border-2 border-slate-300">
                <p className="text-sm text-slate-600 mb-1 font-semibold">Nota Redação</p>
                <p className="text-2xl font-black text-slate-400">-</p>
                <p className="text-xs text-slate-500 mt-1">Não realizada</p>
              </div>
            )}
            <div className="bg-blue-50 rounded-xl p-6 text-center border-2 border-blue-200">
              <p className="text-sm text-blue-700 mb-1 font-semibold">Acertos</p>
              <p className="text-4xl font-black text-blue-600">{results.correct}/{results.total}</p>
              <p className="text-xs text-blue-600 mt-1">Questões objetivas</p>
            </div>
          </div>

          {/* Desempenho por Matéria */}
          {Object.keys(results.byMateria || {}).length > 0 && (
            <div className="mb-8">
              <h3 className="text-xl font-black text-slate-900 mb-4">Desempenho por Matéria</h3>
              <div className="space-y-3">
                {Object.entries(results.byMateria).map(([materia, data]) => {
                  const total = data.correct + data.wrong
                  const materiaAccuracy = total > 0 ? ((data.correct / total) * 100).toFixed(1) : 0
                  return (
                    <div key={materia} className="bg-slate-100 rounded-lg p-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold text-slate-900">{materia}</span>
                        <span className="text-lg font-black text-alego-600">{materiaAccuracy}%</span>
                      </div>
                      <div className="flex gap-3 text-sm">
                        <span className="text-green-600 font-semibold">✓ {data.correct}</span>
                        <span className="text-red-600 font-semibold">✗ {data.wrong}</span>
                        <span className="text-slate-500">Total: {total}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="text-center text-sm text-slate-500 border-t border-slate-200 pt-6">
            <p>Realizado em {new Date(results.completedAt || Date.now()).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</p>
            <p className="mt-2 font-semibold text-alego-600">FlashConCards - Plataforma de Estudos</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ResultExport

