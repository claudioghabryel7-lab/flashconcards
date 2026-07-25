import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { ArrowLeftIcon, FireIcon, TrashIcon, PencilIcon } from '@heroicons/react/24/outline'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { generateAiJson, formatAiErrorForUser } from '../utils/geminiApi'
import { generateIncidenciaCompleta } from '../utils/incidenciaGeneration'
import { startBackgroundGeneration } from '../services/aiGenerationRunner'
import { isContentAvailable, CONTENT_STATUS, toggleContentStatus } from '../utils/contentStatus'
import ContentPublishButton from '../components/ContentPublishButton'
import { probabilidadeBadgeClass } from '../utils/htmlTextHelpers'

const ConteudoIncidenciaView = () => {
  const { courseId, disciplinaIdx } = useParams()
  const navigate = useNavigate()
  const { user, profile, isAdmin } = useAuth()
  const { darkMode } = useDarkMode()
  
  const [loading, setLoading] = useState(true)
  const [editalVerticalizado, setEditalVerticalizado] = useState(null)
  const [courseName, setCourseName] = useState('')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [conteudoGerado, setConteudoGerado] = useState(null)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [editingRevisao, setEditingRevisao] = useState(false)
  const [editDraft, setEditDraft] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [togglingStatus, setTogglingStatus] = useState(false)

  const disciplinaIndex = parseInt(disciplinaIdx)

  useEffect(() => {
    const loadData = async () => {
      if (!courseId || disciplinaIdx === undefined) {
        setError('Parâmetros inválidos')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError('')

        // Carregar nome do curso
        const courseRef = doc(db, 'courses', courseId)
        const courseDoc = await getDoc(courseRef)
        if (courseDoc.exists()) {
          const data = courseDoc.data()
          setCourseName(data.name || data.competition || 'Curso Preparatório')
        }

        // Carregar edital verticalizado
        const editalRef = doc(db, 'courses', courseId, 'editalVerticalizado', 'principal')
        const editalDoc = await getDoc(editalRef)
        
        if (!editalDoc.exists()) {
          setError('Edital verticalizado não encontrado')
          setLoading(false)
          return
        }

        const editalData = editalDoc.data()
        
        // Verificar se o edital está dividido em partes
        if (editalData.temPartes && editalData.totalPartes > 1) {
          const { collection, getDocs, query, orderBy } = await import('firebase/firestore')
          const partesRef = collection(db, 'courses', courseId, 'editalVerticalizado', 'principal', 'partes')
          const partesSnapshot = await getDocs(query(partesRef, orderBy('parte')))

          const todasDisciplinas = [...(editalData.disciplinas || [])]
          partesSnapshot.forEach((doc) => {
            const parteData = doc.data()
            if (parteData.disciplinas && Array.isArray(parteData.disciplinas)) {
              todasDisciplinas.push(...parteData.disciplinas)
            }
          })

          setEditalVerticalizado({
            ...editalData,
            disciplinas: todasDisciplinas,
          })
        } else {
          setEditalVerticalizado(editalData)
        }

        // Carregar conteúdo de incidência existente
        const disciplinaIndex = parseInt(disciplinaIdx)
        if (editalVerticalizado?.disciplinas || editalData?.disciplinas) {
          const disciplinas = editalData.temPartes && editalData.totalPartes > 1 
            ? [...(editalData.disciplinas || []), ...todasDisciplinas.slice(editalData.disciplinas?.length || 0)]
            : editalData.disciplinas
          
          const disciplina = disciplinas[disciplinaIndex]
          if (disciplina?.nome) {
            const sanitizedDisciplinaNome = disciplina.nome
              .replace(/[^a-zA-Z0-9]/g, '_')
              .substring(0, 100)

            const incidenciaRef = doc(db, 'courses', courseId, 'conteudosIncidencia', sanitizedDisciplinaNome)
            const incidenciaDoc = await getDoc(incidenciaRef)
            if (incidenciaDoc.exists()) {
              setConteudoGerado(incidenciaDoc.data())
            }
          }
        }

        setLoading(false)
      } catch (err) {
        console.error('Erro ao carregar dados:', err)
        setError('Erro ao carregar dados: ' + (err.message || 'Erro desconhecido'))
        setLoading(false)
      }
    }

    loadData()
  }, [courseId, disciplinaIdx])

  const handleGenerate = async () => {
    if (!courseId || !editalVerticalizado?.disciplinas || disciplinaIndex === undefined) return

    const disciplina = editalVerticalizado.disciplinas[disciplinaIndex]
    if (!disciplina?.topicos || disciplina.topicos.length === 0) {
      setStatus('❌ Esta disciplina não possui tópicos.')
      return
    }

    try {
      setGenerating(true)
      setProgress(5)
      setStatus('Carregando dados do edital...')

      // Carregar dados do curso
      const courseRef = doc(db, 'courses', courseId)
      const courseDoc = await getDoc(courseRef)
      const courseData = courseDoc.exists() ? courseDoc.data() : {}
      const banca = courseData.banca || ''
      const cargo = courseData.cargo || courseData.competition || ''
      const concursoName = courseData.competition || courseData.name || courseName || ''
      const nivelCurso = courseData.nivel || courseData.nivelCurso || courseData.escolaridade || ''

      // Carregar edital verticalizado para contexto
      const editalRef = doc(db, 'courses', courseId, 'editalVerticalizado', 'principal')
      const editalDoc = await getDoc(editalRef)
      const editalData = editalDoc.exists() ? editalDoc.data() : {}
      const editalText = (editalData.pdfText || editalData.prompt || '').toString()

      setProgress(20)
      setStatus('Preparando estrutura da disciplina...')

      // Preparar estrutura dos tópicos da disciplina
      const topicosStructure = disciplina.topicos.map(topico => ({
        numero: topico.numero || '',
        nome: topico.nome || ''
      }))

      setProgress(35)
      setStatus('Enviando solicitação para a IA (lotes para não cortar a revisão)…')

      const { promise } = await startBackgroundGeneration({
        userId: user?.uid,
        courseId,
        jobType: 'conteudo_incidencia',
        topicKey: String(disciplinaIdx),
        metadata: { disciplina: disciplina.nome },
        serverPayload: {
          courseMeta: {
            banca,
            cargo,
            concursoName,
            courseName: courseName || 'Curso Preparatório',
            nivelCurso,
            editalText,
          },
          savePlan: {
            disciplinaNome: disciplina.nome,
            disciplinaIdx: disciplinaIndex,
            docId: disciplina.nome.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100),
            topicos: topicosStructure,
            status: 'indisponivel',
          },
          aiOptions: {
            useRAG: true,
            isLegalContent: true,
          },
        },
        task: async ({ updateProgress }) => {
          await updateProgress(40, 'Gerando revisão completa em lotes…')
          const parsed = await generateIncidenciaCompleta({
            disciplinaNome: disciplina.nome,
            topicos: topicosStructure,
            banca,
            cargo,
            concursoName,
            courseName: courseName || 'Curso Preparatório',
            nivelCurso,
            editalText,
            courseId,
            generateFn: generateAiJson,
            onProgress: updateProgress,
          })

          await updateProgress(90, 'Salvando conteúdo…')

          const sanitizedDisciplinaNome = disciplina.nome
            .replace(/[^a-zA-Z0-9]/g, '_')
            .substring(0, 100)

          const incidenciaRef = doc(db, 'courses', courseId, 'conteudosIncidencia', sanitizedDisciplinaNome)
          await setDoc(incidenciaRef, {
            ...parsed,
            disciplinaIdx: disciplinaIndex,
            status: 'indisponivel',
            updatedAt: serverTimestamp(),
            generatedAt: serverTimestamp(),
          }, { merge: true })

          return parsed
        },
      })

      promise
        .then((parsed) => {
          setConteudoGerado(parsed)
          setProgress(100)
          setStatus('✅ Conteúdo gerado com sucesso!')
        })
        .catch((error) => {
          console.error('Erro ao gerar conteúdo de incidência:', error)
          setStatus(`❌ ${formatAiErrorForUser(error)}`)
        })
        .finally(() => {
          setGenerating(false)
          setTimeout(() => setProgress(0), 800)
        })

      return

    } catch (error) {
      console.error('Erro ao gerar conteúdo de incidência:', error)
      setStatus(`❌ ${formatAiErrorForUser(error)}`)
      setGenerating(false)
      setTimeout(() => setProgress(0), 800)
    }
  }

  const getSanitizedDisciplinaKey = (nome) =>
    (nome || '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100)

  const handleToggleStatus = async () => {
    if (!courseId || !disciplina || !conteudoGerado) return
    setTogglingStatus(true)
    try {
      const key = getSanitizedDisciplinaKey(disciplina.nome)
      const next = toggleContentStatus(conteudoGerado.status)
      const ref = doc(db, 'courses', courseId, 'conteudosIncidencia', key)
      await setDoc(ref, { status: next, updatedAt: serverTimestamp() }, { merge: true })
      setConteudoGerado((prev) => ({ ...prev, status: next }))
    } catch (err) {
      alert('Erro ao alterar status: ' + err.message)
    } finally {
      setTogglingStatus(false)
    }
  }

  const handleStartEditRevisao = () => {
    if (!conteudoGerado) return
    setEditDraft(JSON.parse(JSON.stringify(conteudoGerado)))
    setEditingRevisao(true)
  }

  const handleSaveRevisao = async () => {
    if (!courseId || !disciplina || !editDraft) return
    setSavingEdit(true)
    try {
      const key = getSanitizedDisciplinaKey(disciplina.nome)
      const ref = doc(db, 'courses', courseId, 'conteudosIncidencia', key)
      await setDoc(ref, { ...editDraft, updatedAt: serverTimestamp() }, { merge: true })
      setConteudoGerado(editDraft)
      setEditingRevisao(false)
      setEditDraft(null)
    } catch (err) {
      alert('Erro ao salvar: ' + err.message)
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDelete = async () => {
    if (!courseId || !disciplina) return

    if (!window.confirm('Tem certeza que deseja apagar o conteúdo de incidência desta disciplina?')) {
      return
    }

    try {
      setDeleting(true)
      setStatus('Apagando conteúdo...')

      const sanitizedDisciplinaNome = disciplina.nome
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 100)

      const incidenciaRef = doc(db, 'courses', courseId, 'conteudosIncidencia', sanitizedDisciplinaNome)
      await deleteDoc(incidenciaRef)

      setConteudoGerado(null)
      setStatus('')
      setProgress(0)
    } catch (error) {
      console.error('Erro ao apagar conteúdo:', error)
      setStatus(`❌ Erro ao apagar: ${error.message || 'Erro desconhecido'}`)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-cp-accent border-t-transparent" />
          <p className="mt-4 text-sm text-cp-muted">Carregando incidência…</p>
        </div>
      </div>
    )
  }

  if (error || !editalVerticalizado?.disciplinas) {
    return (
      <div className="max-w-lg mx-auto p-8">
        <div className="cp-card p-10 text-center space-y-4">
          <p className="font-medium text-red-400">{error || 'Dados não encontrados'}</p>
          <Link to="/edital-verticalizado" className="cp-btn-ghost inline-flex">
            <ArrowLeftIcon className="h-4 w-4" />
            Voltar ao edital
          </Link>
        </div>
      </div>
    )
  }

  const disciplina = editalVerticalizado.disciplinas[disciplinaIndex]
  if (conteudoGerado && !isContentAvailable(conteudoGerado.status, isAdmin)) {
    return (
      <div className="max-w-lg mx-auto p-8">
        <div className="cp-card p-10 text-center">
          <p className="text-4xl mb-3">🔒</p>
          <p className="font-medium text-cp-text">Conteúdo de incidência em preparação</p>
          <p className="mt-2 text-sm text-cp-muted">
            O administrador ainda não liberou este material.
          </p>
          <Link to="/edital-verticalizado" className="cp-btn-ghost mt-6 inline-flex">
            Voltar ao edital
          </Link>
        </div>
      </div>
    )
  }

  const displayData = editingRevisao && editDraft ? editDraft : conteudoGerado
  const topAssuntosCount = displayData?.topAssuntosGerais?.length || 0
  const topicosCount = displayData?.analisePorTopico?.length || disciplina?.topicos?.length || 0

  const updateTopAssunto = (idx, field, value) => {
    setEditDraft((prev) => {
      const next = { ...prev, topAssuntosGerais: [...(prev.topAssuntosGerais || [])] }
      next.topAssuntosGerais[idx] = { ...next.topAssuntosGerais[idx], [field]: value }
      return next
    })
  }

  const updateTopicoAssunto = (tIdx, aIdx, field, value) => {
    setEditDraft((prev) => {
      const analise = [...(prev.analisePorTopico || [])]
      const assuntos = [...(analise[tIdx].assuntos || [])]
      assuntos[aIdx] = { ...assuntos[aIdx], [field]: value }
      analise[tIdx] = { ...analise[tIdx], assuntos }
      return { ...prev, analisePorTopico: analise }
    })
  }

  return (
    <div className="space-y-6">
      {courseName && (
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-cp-muted">{courseName}</p>
      )}

      <Link to="/edital-verticalizado" className="inline-flex items-center gap-2 text-sm text-cp-muted hover:text-cp-accent transition">
        <ArrowLeftIcon className="h-4 w-4" />
        Voltar ao edital
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10">
            <FireIcon className="h-6 w-6 text-red-400" />
          </div>
          <div>
            <span className="cp-badge cp-badge-accent mb-2">Revisão por incidência</span>
            <h1 className="cp-headline text-xl sm:text-2xl">{disciplina?.nome || 'Disciplina'}</h1>
            <p className="mt-1 text-sm text-cp-muted">O que mais cai nesta matéria — ordenado por probabilidade</p>
          </div>
        </div>
        {isAdmin && conteudoGerado && (
          <div className="flex flex-wrap items-center gap-2">
            <ContentPublishButton
              status={conteudoGerado.status}
              onToggle={handleToggleStatus}
              disabled={togglingStatus}
            />
            {!editingRevisao ? (
              <button type="button" onClick={handleStartEditRevisao} className="cp-btn-ghost !text-xs">
                <PencilIcon className="h-4 w-4" />
                Editar revisões
              </button>
            ) : (
              <>
                <button type="button" onClick={handleSaveRevisao} disabled={savingEdit} className="cp-btn-primary !text-xs">
                  {savingEdit ? 'Salvando…' : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingRevisao(false); setEditDraft(null) }}
                  className="cp-btn-ghost !text-xs"
                >
                  Cancelar
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {!conteudoGerado ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="cp-card p-4">
              <p className="font-mono text-[10px] uppercase text-cp-muted">Tópicos</p>
              <p className="mt-1 text-2xl font-medium text-cp-text">{disciplina?.topicos?.length || 0}</p>
            </div>
            <div className="cp-card p-4">
              <p className="font-mono text-[10px] uppercase text-cp-muted">Disciplina</p>
              <p className="mt-1 text-sm font-medium text-cp-text truncate">{disciplina?.nome}</p>
            </div>
            <div className="cp-card p-4 col-span-2 sm:col-span-1">
              <p className="font-mono text-[10px] uppercase text-cp-muted">Status</p>
              <p className="mt-1 text-sm text-cp-muted">Aguardando geração</p>
            </div>
          </div>

          <div className="cp-card p-5 space-y-4">
            <p className="text-sm text-cp-text">
              A IA analisa todos os tópicos, atribui probabilidade de incidência e gera o conteúdo de revisão para cada assunto.
            </p>
            {status && (
              <div>
                <p className="text-xs text-cp-muted">{status}</p>
                {progress > 0 && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cp-border">
                    <div className="h-full rounded-full bg-gradient-to-r from-cp-accent to-red-500 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                )}
              </div>
            )}
            <button type="button" onClick={handleGenerate} disabled={generating} className="cp-btn-primary w-full justify-center">
              <FireIcon className="h-5 w-5" />
              {generating ? 'Gerando análise…' : 'Gerar conteúdo de incidência'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="cp-card p-4">
              <p className="font-mono text-[10px] uppercase text-cp-muted">Top assuntos</p>
              <p className="mt-1 text-2xl font-medium text-cp-text">{topAssuntosCount}</p>
            </div>
            <div className="cp-card p-4">
              <p className="font-mono text-[10px] uppercase text-cp-muted">Tópicos</p>
              <p className="mt-1 text-2xl font-medium text-cp-text">{topicosCount}</p>
            </div>
            <div className="cp-card p-4">
              <p className="font-mono text-[10px] uppercase text-cp-muted">Dicas</p>
              <p className="mt-1 text-2xl font-medium text-cp-accent2">{displayData?.dicasEstudo?.length || 0}</p>
            </div>
            <div className="cp-card p-4">
              <p className="font-mono text-[10px] uppercase text-cp-muted">Status</p>
              <p className={`mt-1 text-sm font-medium ${conteudoGerado.status === CONTENT_STATUS.AVAILABLE ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                {conteudoGerado.status === CONTENT_STATUS.AVAILABLE ? 'Liberado' : 'Pendente'}
              </p>
            </div>
          </div>

          {displayData?.topAssuntosGerais?.length > 0 && (
            <div className="cp-card p-5 space-y-3">
              <h2 className="font-mono text-[10px] uppercase tracking-wider text-cp-muted">Top assuntos gerais</h2>
              {(editingRevisao
                ? displayData.topAssuntosGerais
                : [...(displayData.topAssuntosGerais || [])].sort((a, b) => (b.probabilidade || 0) - (a.probabilidade || 0))
              ).map((assunto, idx) => (
                  <div key={idx} className="rounded-xl border border-cp-border/60 p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {editingRevisao ? (
                        <input
                          type="text"
                          value={assunto.assunto || ''}
                          onChange={(e) => updateTopAssunto(idx, 'assunto', e.target.value)}
                          className="flex-1 min-w-[140px] rounded-lg border border-cp-border bg-cp-bg/60 px-2 py-1 text-sm text-cp-text"
                        />
                      ) : (
                        <span className="font-medium text-cp-text">{assunto.assunto}</span>
                      )}
                      <span className={`cp-badge !text-[10px] border ${probabilidadeBadgeClass(assunto.probabilidade)}`}>
                        {assunto.probabilidade}% chance
                      </span>
                    </div>
                    {(assunto.revisao || editingRevisao) && (
                      <div>
                        <p className="font-mono text-[10px] uppercase text-cp-muted mb-1">O que estudar</p>
                        {editingRevisao ? (
                          <textarea
                            value={assunto.revisao || ''}
                            onChange={(e) => updateTopAssunto(idx, 'revisao', e.target.value)}
                            rows={4}
                            className="w-full rounded-xl border border-cp-border bg-cp-bg/60 px-3 py-2 text-sm text-cp-text resize-y"
                          />
                        ) : (
                          <p className="text-sm text-cp-muted whitespace-pre-wrap">{assunto.revisao}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {displayData?.dicasEstudo?.length > 0 && (
            <div className="cp-card p-5">
              <h2 className="font-mono text-[10px] uppercase tracking-wider text-cp-muted mb-3">Dicas de estudo</h2>
              <ul className="space-y-2">
                {displayData.dicasEstudo.map((dica, idx) => (
                  <li key={idx} className="flex gap-2 text-sm text-cp-text">
                    <span className="text-cp-accent2">•</span>
                    {dica}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {displayData?.analisePorTopico?.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-mono text-[10px] uppercase tracking-wider text-cp-muted px-1">Análise por tópico</h2>
              {displayData.analisePorTopico.map((topico, tIdx) => (
                <div key={tIdx} className="cp-card overflow-hidden">
                  <div className="border-b border-cp-border px-4 py-3 bg-cp-bg/30">
                    <p className="text-sm font-medium text-cp-text">
                      {topico.topicoNumero && (
                        <span className="mr-2 font-mono text-xs text-cp-accent">{topico.topicoNumero}</span>
                      )}
                      {topico.topicoNome}
                    </p>
                  </div>
                  <div className="divide-y divide-cp-border/50 p-4 space-y-3">
                    {[...(topico.assuntos || [])]
                      .sort((a, b) => (b.probabilidade || 0) - (a.probabilidade || 0))
                      .map((assunto, aIdx) => (
                        <div key={aIdx} className="pl-3 border-l-2 border-cp-accent/40 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            {editingRevisao ? (
                              <input
                                type="text"
                                value={assunto.assunto || ''}
                                onChange={(e) => updateTopicoAssunto(tIdx, aIdx, 'assunto', e.target.value)}
                                className="flex-1 min-w-[140px] rounded-lg border border-cp-border bg-cp-bg/60 px-2 py-1 text-sm text-cp-text"
                              />
                            ) : (
                              <span className="text-sm font-medium text-cp-text">{assunto.assunto}</span>
                            )}
                            <span className={`font-mono text-[10px] px-2 py-0.5 rounded-full border ${probabilidadeBadgeClass(assunto.probabilidade)}`}>
                              {assunto.probabilidade}%
                            </span>
                          </div>
                          {(assunto.revisao || editingRevisao) && (
                            editingRevisao ? (
                              <textarea
                                value={assunto.revisao || ''}
                                onChange={(e) => updateTopicoAssunto(tIdx, aIdx, 'revisao', e.target.value)}
                                rows={3}
                                className="w-full rounded-xl border border-cp-border bg-cp-bg/60 px-3 py-2 text-sm text-cp-text resize-y"
                              />
                            ) : (
                              <p className="text-sm text-cp-muted whitespace-pre-wrap">{assunto.revisao}</p>
                            )
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Link to={`/pratica-incidencia/${courseId}/${disciplinaIdx}`} className="cp-btn-primary flex-1 justify-center">
              <FireIcon className="h-5 w-5" />
              Praticar questões
            </Link>
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => { setConteudoGerado(null); setStatus(''); setProgress(0) }}
                  className="cp-btn-ghost flex-1 justify-center"
                >
                  Gerar novamente
                </button>
                <button type="button" onClick={handleDelete} disabled={deleting} className="cp-btn-ghost !text-red-400 flex-1 justify-center">
                  <TrashIcon className="h-4 w-4" />
                  {deleting ? 'Apagando…' : 'Apagar'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ConteudoIncidenciaView
