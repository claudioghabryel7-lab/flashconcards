import { useState, useEffect } from 'react'
import { 
  PlusIcon, 
  PencilIcon, 
  TrashIcon, 
  ChevronDownIcon, 
  ChevronRightIcon,
  DocumentArrowDownIcon,
  DocumentArrowUpIcon,
  ArrowPathIcon,
  EyeIcon,
  EyeSlashIcon
} from '@heroicons/react/24/outline'
import { editalVerticalizadoService } from '../services/editalVerticalizadoService'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'

const EditalVerticalizadoManager = () => {
  const { isAdmin } = useAuth()
  const { darkMode } = useDarkMode()
  const [edital, setEdital] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedMaterias, setExpandedMaterias] = useState(new Set())
  const [showMateriaForm, setShowMateriaForm] = useState(false)
  const [showTopicoForm, setShowTopicoForm] = useState(false)
  const [editingMateria, setEditingMateria] = useState(null)
  const [editingTopico, setEditingTopico] = useState(null)
  const [selectedMateriaForTopico, setSelectedMateriaForTopico] = useState(null)
  const [importData, setImportData] = useState('')
  const [showImportModal, setShowImportModal] = useState(false)

  // Form data
  const [materiaForm, setMateriaForm] = useState({
    nome: '',
    descricao: '',
    ordem: 0,
    ativo: true
  })

  const [topicoForm, setTopicoForm] = useState({
    nome: '',
    descricao: '',
    conteudo: '',
    ordem: 0,
    ativo: true
  })

  useEffect(() => {
    loadEdital()
  }, [])

  const loadEdital = async () => {
    try {
      setLoading(true)
      const editalData = await editalVerticalizadoService.getEditalCompleto()
      setEdital(editalData)
    } catch (error) {
      console.error('Erro ao carregar edital:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleMateriaExpansion = (materiaId) => {
    const newExpanded = new Set(expandedMaterias)
    if (newExpanded.has(materiaId)) {
      newExpanded.delete(materiaId)
    } else {
      newExpanded.add(materiaId)
    }
    setExpandedMaterias(newExpanded)
  }

  const handleCreateMateria = async (e) => {
    e.preventDefault()
    try {
      if (editingMateria) {
        await editalVerticalizadoService.updateMateria(editingMateria.id, materiaForm)
      } else {
        await editalVerticalizadoService.createMateria({
          ...materiaForm,
          ordem: edital.length
        })
      }

      resetMateriaForm()
      loadEdital()
    } catch (error) {
      console.error('Erro ao salvar matéria:', error)
      alert('Erro ao salvar matéria. Tente novamente.')
    }
  }

  const handleCreateTopico = async (e) => {
    e.preventDefault()
    if (!selectedMateriaForTopico) return

    try {
      if (editingTopico) {
        await editalVerticalizadoService.updateTopico(editingTopico.id, topicoForm)
      } else {
        await editalVerticalizadoService.createTopico(selectedMateriaForTopico, {
          ...topicoForm,
          ordem: edital.find(m => m.id === selectedMateriaForTopico)?.topicos?.length || 0
        })
      }

      resetTopicoForm()
      loadEdital()
    } catch (error) {
      console.error('Erro ao salvar tópico:', error)
      alert('Erro ao salvar tópico. Tente novamente.')
    }
  }

  const handleDeleteMateria = async (materiaId) => {
    if (!confirm('Tem certeza que deseja excluir esta matéria e todos seus tópicos?')) return

    try {
      await editalVerticalizadoService.deleteMateria(materiaId)
      loadEdital()
    } catch (error) {
      console.error('Erro ao excluir matéria:', error)
      alert('Erro ao excluir matéria. Tente novamente.')
    }
  }

  const handleDeleteTopico = async (topicoId) => {
    if (!confirm('Tem certeza que deseja excluir este tópico?')) return

    try {
      await editalVerticalizadoService.deleteTopico(topicoId)
      loadEdital()
    } catch (error) {
      console.error('Erro ao excluir tópico:', error)
      alert('Erro ao excluir tópico. Tente novamente.')
    }
  }

  const handleEditMateria = (materia) => {
    setEditingMateria(materia)
    setMateriaForm({
      nome: materia.nome,
      descricao: materia.descricao,
      ordem: materia.ordem,
      ativo: materia.ativo
    })
    setShowMateriaForm(true)
  }

  const handleEditTopico = (topico, materiaId) => {
    setEditingTopico(topico)
    setSelectedMateriaForTopico(materiaId)
    setTopicoForm({
      nome: topico.nome,
      descricao: topico.descricao,
      conteudo: topico.conteudo,
      ordem: topico.ordem,
      ativo: topico.ativo
    })
    setShowTopicoForm(true)
  }

  const handleToggleMateriaStatus = async (materiaId, ativo) => {
    try {
      await editalVerticalizadoService.updateMateria(materiaId, { ativo })
      loadEdital()
    } catch (error) {
      console.error('Erro ao atualizar status da matéria:', error)
    }
  }

  const handleToggleTopicoStatus = async (topicoId, ativo) => {
    try {
      await editalVerticalizadoService.updateTopico(topicoId, { ativo })
      loadEdital()
    } catch (error) {
      console.error('Erro ao atualizar status do tópico:', error)
    }
  }

  const handleDuplicateMateria = async (materiaId) => {
    const novoNome = prompt('Digite o nome para a matéria duplicada:')
    if (!novoNome) return

    try {
      await editalVerticalizadoService.duplicateMateria(materiaId, novoNome)
      loadEdital()
    } catch (error) {
      console.error('Erro ao duplicar matéria:', error)
      alert('Erro ao duplicar matéria. Tente novamente.')
    }
  }

  const handleExport = async () => {
    try {
      const exportData = await editalVerticalizadoService.exportToJSON()
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `edital-verticalizado-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Erro ao exportar edital:', error)
      alert('Erro ao exportar edital. Tente novamente.')
    }
  }

  const handleImport = async () => {
    try {
      const data = JSON.parse(importData)
      const results = await editalVerticalizadoService.importFromJSON(data)
      
      alert(`Importação concluída!\nMatérias criadas: ${results.materiasCriadas}\nTópicos criados: ${results.topicosCriados}\nErros: ${results.erros.length}`)
      
      if (results.erros.length > 0) {
        console.error('Erros na importação:', results.erros)
      }
      
      setShowImportModal(false)
      setImportData('')
      loadEdital()
    } catch (error) {
      console.error('Erro ao importar edital:', error)
      alert('Erro ao importar edital. Verifique o formato do JSON.')
    }
  }

  const resetMateriaForm = () => {
    setMateriaForm({
      nome: '',
      descricao: '',
      ordem: 0,
      ativo: true
    })
    setEditingMateria(null)
    setShowMateriaForm(false)
  }

  const resetTopicoForm = () => {
    setTopicoForm({
      nome: '',
      descricao: '',
      conteudo: '',
      ordem: 0,
      ativo: true
    })
    setEditingTopico(null)
    setSelectedMateriaForTopico(null)
    setShowTopicoForm(false)
  }

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-600 dark:text-slate-400">
          Acesso negado. Apenas administradores podem gerenciar o edital verticalizado.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-alego-600 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          Edital Verticalizado
        </h2>
        <div className="flex gap-3">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <DocumentArrowDownIcon className="h-5 w-5" />
            Exportar
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <DocumentArrowUpIcon className="h-5 w-5" />
            Importar
          </button>
          <button
            onClick={() => setShowMateriaForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-alego-600 text-white rounded-lg hover:bg-alego-700 transition-colors"
          >
            <PlusIcon className="h-5 w-5" />
            Nova Matéria
          </button>
        </div>
      </div>

      {/* Lista de Matérias e Tópicos */}
      <div className="space-y-4">
        {edital.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-lg shadow">
            <p className="text-slate-600 dark:text-slate-400">
              Nenhuma matéria encontrada. Crie sua primeira matéria!
            </p>
          </div>
        ) : (
          edital.map((materia) => (
            <div key={materia.id} className="bg-white dark:bg-slate-800 rounded-lg shadow">
              {/* Header da Matéria */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleMateriaExpansion(materia.id)}
                      className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                    >
                      {expandedMaterias.has(materia.id) ? (
                        <ChevronDownIcon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                      ) : (
                        <ChevronRightIcon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                      )}
                    </button>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                          {materia.nome}
                        </h3>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          materia.ativo 
                            ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' 
                            : 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
                        }`}>
                          {materia.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                      {materia.descricao && (
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                          {materia.descricao}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleMateriaStatus(materia.id, !materia.ativo)}
                      className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                      title={materia.ativo ? 'Desativar' : 'Ativar'}
                    >
                      {materia.ativo ? (
                        <EyeIcon className="h-5 w-5" />
                      ) : (
                        <EyeSlashIcon className="h-5 w-5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDuplicateMateria(materia.id)}
                      className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                      title="Duplicar"
                    >
                      <ArrowPathIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleEditMateria(materia)}
                      className="p-2 text-slate-600 dark:text-slate-400 hover:text-alego-600 dark:hover:text-alego-400"
                      title="Editar"
                    >
                      <PencilIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleDeleteMateria(materia.id)}
                      className="p-2 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                      title="Excluir"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <button
                    onClick={() => {
                      setSelectedMateriaForTopico(materia.id)
                      setShowTopicoForm(true)
                    }}
                    className="flex items-center gap-2 px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors text-sm"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Novo Tópico
                  </button>
                </div>
              </div>

              {/* Tópicos da Matéria */}
              {expandedMaterias.has(materia.id) && (
                <div className="p-4 space-y-3">
                  {materia.topicos && materia.topicos.length > 0 ? (
                    materia.topicos.map((topico) => (
                      <div key={topico.id} className="bg-slate-50 dark:bg-slate-700 p-3 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-slate-800 dark:text-slate-100">
                                {topico.nome}
                              </h4>
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                topico.ativo 
                                  ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' 
                                  : 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
                              }`}>
                                {topico.ativo ? 'Ativo' : 'Inativo'}
                              </span>
                            </div>
                            {topico.descricao && (
                              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                                {topico.descricao}
                              </p>
                            )}
                            {topico.conteudo && (
                              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                                {topico.conteudo}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleToggleTopicoStatus(topico.id, !topico.ativo)}
                              className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                              title={topico.ativo ? 'Desativar' : 'Ativar'}
                            >
                              {topico.ativo ? (
                                <EyeIcon className="h-5 w-5" />
                              ) : (
                                <EyeSlashIcon className="h-5 w-5" />
                              )}
                            </button>
                            <button
                              onClick={() => handleEditTopico(topico, materia.id)}
                              className="p-2 text-slate-600 dark:text-slate-400 hover:text-alego-600 dark:hover:text-alego-400"
                              title="Editar"
                            >
                              <PencilIcon className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteTopico(topico.id)}
                              className="p-2 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                              title="Excluir"
                            >
                              <TrashIcon className="h-5 w-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 text-slate-500 dark:text-slate-400">
                      Nenhum tópico encontrado. Crie o primeiro tópico desta matéria.
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Formulário de Matéria */}
      {showMateriaForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 w-full max-w-2xl">
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">
              {editingMateria ? 'Editar Matéria' : 'Nova Matéria'}
            </h3>

            <form onSubmit={handleCreateMateria} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nome da Matéria
                </label>
                <input
                  type="text"
                  required
                  value={materiaForm.nome}
                  onChange={(e) => setMateriaForm({ ...materiaForm, nome: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                  placeholder="Ex: Português"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Descrição
                </label>
                <textarea
                  value={materiaForm.descricao}
                  onChange={(e) => setMateriaForm({ ...materiaForm, descricao: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                  rows={3}
                  placeholder="Descrição da matéria..."
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="materiaAtiva"
                  checked={materiaForm.ativo}
                  onChange={(e) => setMateriaForm({ ...materiaForm, ativo: e.target.checked })}
                  className="mr-2"
                />
                <label htmlFor="materiaAtiva" className="text-sm text-slate-700 dark:text-slate-300">
                  Matéria ativa
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetMateriaForm}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-alego-600 text-white rounded-lg hover:bg-alego-700 transition-colors"
                >
                  {editingMateria ? 'Atualizar' : 'Criar'} Matéria
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Formulário de Tópico */}
      {showTopicoForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 w-full max-w-2xl">
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">
              {editingTopico ? 'Editar Tópico' : 'Novo Tópico'}
            </h3>

            <form onSubmit={handleCreateTopico} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Tópico
                </label>
                <input
                  type="text"
                  required
                  value={topicoForm.nome}
                  onChange={(e) => setTopicoForm({ ...topicoForm, nome: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                  placeholder="Ex: Interpretação de Texto"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Descrição
                </label>
                <textarea
                  value={topicoForm.descricao}
                  onChange={(e) => setTopicoForm({ ...topicoForm, descricao: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                  rows={3}
                  placeholder="Descrição do tópico..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Conteúdo
                </label>
                <textarea
                  value={topicoForm.conteudo}
                  onChange={(e) => setTopicoForm({ ...topicoForm, conteudo: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                  rows={5}
                  placeholder="Conteúdo detalhado do tópico..."
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="topicoAtivo"
                  checked={topicoForm.ativo}
                  onChange={(e) => setTopicoForm({ ...topicoForm, ativo: e.target.checked })}
                  className="mr-2"
                />
                <label htmlFor="topicoAtivo" className="text-sm text-slate-700 dark:text-slate-300">
                  Tópico ativo
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetTopicoForm}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-alego-600 text-white rounded-lg hover:bg-alego-700 transition-colors"
                >
                  {editingTopico ? 'Atualizar' : 'Criar'} Tópico
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Importação */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 w-full max-w-2xl">
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">
              Importar Edital
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Cole o JSON do edital
                </label>
                <textarea
                  value={importData}
                  onChange={(e) => setImportData(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 font-mono text-sm"
                  rows={10}
                  placeholder='{"materias": [{"nome": "Português", "topicos": [{"nome": "Interpretação"}]}]}'
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowImportModal(false)
                    setImportData('')
                  }}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleImport}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Importar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default EditalVerticalizadoManager
