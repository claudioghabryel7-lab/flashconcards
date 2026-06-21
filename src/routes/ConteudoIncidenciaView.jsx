import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { ArrowLeftIcon, FireIcon, TrashIcon } from '@heroicons/react/24/outline'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { callGeminiWithRetry, extractGeneratedText } from '../utils/geminiApi'

const ConteudoIncidenciaView = () => {
  const { courseId, disciplinaIdx } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
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

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) {
      setStatus('❌ API Key não configurada.')
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
      setStatus('Enviando solicitação para a IA...')

      // Prompt para a IA gerar conteúdo de maior incidência
      const prompt = `Você é um especialista em análise de concursos públicos e previsão de temas para provas. ATUE COMO UMA "VIDENTE" - você sabe exatamente o que vai cair na prova.

CONTEXTO:
- CURSO: ${courseName || 'Curso Preparatório'}
- CARGO: ${cargo || 'NÃO DEFINIDO'}
- BANCA EXAMINADORA: ${banca || 'NÃO DEFINIDA'}
- DISCIPLINA: ${disciplina.nome}

TÓPICOS DA DISCIPLINA:
${topicosStructure.map((t, i) => `${i + 1}. ${t.numero} - ${t.nome}`).join('\n')}

EDITAL BASE (trecho relevante):
${editalText.substring(0, 10000)}${editalText.length > 10000 ? '\n\n[texto truncado...]' : ''}

TAREFA:
Analise TODOS os tópicos desta disciplina e gere um conteúdo de revisão focado no que REALMENTE vai cair na prova.

INSTRUÇÕES CRÍTICAS:
1. Para CADA tópico da disciplina, identifique os assuntos que serão cobrados
2. Atribua uma probabilidade de incidência (10-100%) para cada assunto baseado:
   - No histórico específico da banca ${banca || 'NÃO DEFINIDA'}
   - No cargo específico: ${cargo || 'NÃO DEFINIDO'}
   - Na relevância do assunto para este concurso
   - Na atualidade e importância do tema
3. ORDENE sempre da MAIOR probabilidade para a MENOR (100% → 10%)
4. Para CADA assunto, gere uma REVISÃO COMPLETA do que o candidato precisa estudar
5. Seja direto e prático: "estude isso porque isso vai cair"
6. Não faça rodeios - o conteúdo deve ser focado no que será cobrado

ESTRUTURA DO JSON:
{
  "disciplina": "${disciplina.nome}",
  "banca": "${banca || 'NÃO DEFINIDA'}",
  "cargo": "${cargo || 'NÃO DEFINIDO'}",
  "curso": "${courseName || 'Curso Preparatório'}",
  "analisePorTopico": [
    {
      "topicoNumero": "número do tópico",
      "topicoNome": "nome do tópico",
      "assuntos": [
        {
          "assunto": "nome do assunto",
          "probabilidade": 95,
          "revisao": "revisão completa do que estudar - seja direto: 'estude X, Y, Z porque isso vai cair'"
        }
      ]
    }
  ],
  "topAssuntosGerais": [
    {
      "assunto": "assunto que mais cairá em toda a disciplina",
      "probabilidade": 95,
      "revisao": "revisão completa do que estudar"
    }
  ],
  "dicasEstudo": [
    "dica 1 de estudo focado",
    "dica 2 de estudo focado"
  ]
}

REGRAS IMPORTANTES:
- Use probabilidades realistas baseadas no histórico da banca ${banca || 'NÃO DEFINIDA'}
- ADAPTE o conteúdo ao cargo específico: ${cargo || 'NÃO DEFINIDO'}
- ORDENE sempre da maior probabilidade para a menor
- Seja uma "vidente": diga exatamente o que estudar
- Use linguagem direta e prática
- Para disciplinas jurídicas: cite leis, artigos e jurisprudência atualizadas
- Para disciplinas não jurídicas: foque em conceitos e aplicações práticas
- DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
- Use apenas informações atualizadas até esta data

Retorne APENAS o JSON válido, sem texto adicional.`

      setProgress(50)
      setStatus('A IA está analisando os tópicos...')

      // Chamar API da IA
      const response = await callGeminiWithRetry(prompt, {
        maxRetries: 3,
        baseDelay: 2000,
        models: ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
        generationConfig: { temperature: 0.7, maxOutputTokens: 32000 },
        useGoogleSearch: true,
      })

      setProgress(75)
      setStatus('Processando resposta da IA...')

      const aiText = extractGeneratedText(response)

      let jsonText = aiText
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '').trim()
      }
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
      if (jsonMatch) jsonText = jsonMatch[0]

      const parsed = JSON.parse(jsonText)

      setProgress(90)
      setStatus('Salvando conteúdo...')

      // Salvar no Firestore
      const sanitizedDisciplinaNome = disciplina.nome
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 100)

      const incidenciaRef = doc(db, 'courses', courseId, 'conteudosIncidencia', sanitizedDisciplinaNome)
      await setDoc(incidenciaRef, {
        ...parsed,
        disciplinaIdx: disciplinaIndex,
        updatedAt: serverTimestamp(),
        generatedAt: serverTimestamp(),
      }, { merge: true })

      setConteudoGerado(parsed)
      setProgress(100)
      setStatus('✅ Conteúdo gerado com sucesso!')

    } catch (error) {
      console.error('Erro ao gerar conteúdo de incidência:', error)
      setStatus(`❌ Erro: ${error.message || 'Erro desconhecido'}`)
    } finally {
      setGenerating(false)
      setTimeout(() => setProgress(0), 800)
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
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-alego-600 border-t-transparent"></div>
          <p className="mt-4 text-lg font-semibold text-alego-600">Carregando dados...</p>
        </div>
      </div>
    )
  }

  if (error || !editalVerticalizado?.disciplinas) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 text-center space-y-4">
          <h2 className="text-2xl font-bold text-red-600 dark:text-red-400">
            {error || 'Dados não encontrados'}
          </h2>
          <Link
            to="/edital-verticalizado"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-white rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Voltar ao Edital Verticalizado
          </Link>
        </div>
      </div>
    )
  }

  const disciplina = editalVerticalizado.disciplinas[disciplinaIndex]

  return (
    <div className="min-h-screen py-6">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            to="/edital-verticalizado"
            className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-alego-600 dark:hover:text-alego-400 mb-4"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Voltar ao Edital Verticalizado
          </Link>
          
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex-shrink-0">
              <FireIcon className="h-8 w-8 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white break-words">
                Conteúdo de Maior Incidência
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                Disciplina: <span className="font-semibold">{disciplina?.nome || 'Não encontrada'}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Conteúdo Principal */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 sm:p-8">
          {!conteudoGerado ? (
            <div className="space-y-6">
              {/* Informações sobre a geração */}
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-orange-900 dark:text-orange-100 mb-4">
                  📊 Análise de Probabilidade
                </h3>
                <div className="text-sm text-orange-800 dark:text-orange-200 space-y-2">
                  <p>• A IA analisará TODOS os tópicos desta disciplina</p>
                  <p>• Identificará assuntos com maior probabilidade de cair</p>
                  <p>• Gerará conteúdo completo para os assuntos mais relevantes</p>
                  <p>• Baseado no histórico da banca e no edital</p>
                  <p>• Total de tópicos: {disciplina?.topicos?.length || 0}</p>
                </div>
              </div>

              {/* Status da geração */}
              {status && (
                <div className="bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                  <p className="text-sm text-gray-800 dark:text-gray-200">
                    {status}
                  </p>
                  {progress > 0 && (
                    <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mt-2">
                      <div
                        className="h-2 bg-orange-600 dark:bg-orange-400 transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Botão de ação */}
              <div className="pt-4">
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white font-medium rounded-lg hover:from-orange-700 hover:to-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                >
                  <FireIcon className="h-6 w-6" />
                  {generating ? 'Gerando Análise...' : 'Gerar Conteúdo de Incidência'}
                </button>
              </div>

              {/* Informações importantes */}
              <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 pt-4">
                <p>• A análise levará em consideração o histórico da banca</p>
                <p>• Conteúdo será salvo no Firestore para consulta futura</p>
                <p>• O processo pode levar alguns minutos dependendo da quantidade de tópicos</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Conteúdo gerado */}
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-green-900 dark:text-green-100 mb-4">
                  ✅ Conteúdo Gerado com Sucesso
                </h3>
                
                {conteudoGerado.topAssuntosGerais && (
                  <div className="mb-6">
                    <h4 className="font-semibold text-green-900 dark:text-green-100 mb-3">
                      🔥 Top Assuntos Gerais (Ordenados por Probabilidade):
                    </h4>
                    <div className="space-y-3">
                      {conteudoGerado.topAssuntosGerais
                        .sort((a, b) => b.probabilidade - a.probabilidade)
                        .map((assunto, idx) => (
                        <div key={idx} className="bg-white dark:bg-slate-800 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-slate-900 dark:text-white">{assunto.assunto}</span>
                            <span className="px-3 py-1 bg-orange-600 text-white text-sm font-bold rounded-full">
                              {assunto.probabilidade}% de chance
                            </span>
                          </div>
                          {assunto.revisao && (
                            <div className="text-sm text-slate-700 dark:text-slate-300 mt-2">
                              <strong>📚 O que estudar:</strong>
                              <p className="mt-1 whitespace-pre-wrap">{assunto.revisao}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {conteudoGerado.dicasEstudo && (
                  <div className="mb-6">
                    <h4 className="font-semibold text-green-900 dark:text-green-100 mb-3">
                      💡 Dicas de Estudo:
                    </h4>
                    <ul className="list-disc list-inside space-y-2">
                      {conteudoGerado.dicasEstudo.map((dica, idx) => (
                        <li key={idx} className="text-sm text-slate-700 dark:text-slate-300">{dica}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {conteudoGerado.analisePorTopico && (
                  <div>
                    <h4 className="font-semibold text-green-900 dark:text-green-100 mb-3">
                      📋 Análise por Tópico (Ordenados por Probabilidade):
                    </h4>
                    <div className="space-y-4">
                      {conteudoGerado.analisePorTopico.map((topico, idx) => (
                        <div key={idx} className="bg-white dark:bg-slate-800 rounded-lg p-4">
                          <h5 className="font-semibold text-slate-900 dark:text-white mb-3">
                            {topico.topicoNumero} - {topico.topicoNome}
                          </h5>
                          {topico.assuntos && topico.assuntos.length > 0 && (
                            <div className="space-y-3">
                              {topico.assuntos
                                .sort((a, b) => b.probabilidade - a.probabilidade)
                                .map((assunto, aIdx) => (
                                <div key={aIdx} className="border-l-4 border-orange-500 pl-3">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-medium text-slate-900 dark:text-white">{assunto.assunto}</span>
                                    <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 text-xs font-bold rounded">
                                      {assunto.probabilidade}%
                                    </span>
                                  </div>
                                  {assunto.revisao && (
                                    <div className="text-sm text-slate-700 dark:text-slate-300 mt-1">
                                      <strong>📚 O que estudar:</strong>
                                      <p className="mt-1 whitespace-pre-wrap">{assunto.revisao}</p>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Botões de ação */}
              <div className="pt-4 space-y-3">
                <button
                  onClick={() => {
                    setConteudoGerado(null)
                    setStatus('')
                    setProgress(0)
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-600 text-white font-medium rounded-lg hover:bg-slate-700 transition-all"
                >
                  <ArrowLeftIcon className="h-5 w-5" />
                  Gerar Novamente
                </button>
                
                {profile?.role === 'admin' && (
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <TrashIcon className="h-5 w-5" />
                    {deleting ? 'Apagando...' : 'Apagar Conteúdo'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ConteudoIncidenciaView
