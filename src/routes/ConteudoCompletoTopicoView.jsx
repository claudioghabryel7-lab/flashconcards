import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc, serverTimestamp } from 'firebase/firestore'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { db } from '../firebase/config'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { GoogleGenerativeAI } from '@google/generative-ai'

const normalizeKey = (text = '') => {
  return decodeURIComponent(text || '')
    .trim()
}

const ConteudoCompletoTopicoView = () => {
  const { courseId, topicKey } = useParams()
  const navigate = useNavigate()
  const { darkMode } = useDarkMode()
  const [conteudo, setConteudo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [courseName, setCourseName] = useState('')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)

  const resolvedCourseId = useMemo(() => courseId || 'alego-default', [courseId])
  const resolvedTopicKey = useMemo(() => normalizeKey(topicKey), [topicKey])

  // Carregar nome do curso
  useEffect(() => {
    const loadCourseName = async () => {
      try {
        const courseDoc = await getDoc(doc(db, 'courses', resolvedCourseId))
        if (courseDoc.exists()) {
          const data = courseDoc.data()
          setCourseName(data.name || data.competition || 'Curso Preparatório')
        } else {
          setCourseName('Curso Preparatório')
        }
      } catch (err) {
        console.error('Erro ao carregar nome do curso:', err)
        setCourseName('Curso Preparatório')
      }
    }

    if (resolvedCourseId && db) {
      loadCourseName()
    }
  }, [resolvedCourseId])

  // Substituir referências ao concurso pelo nome do curso
  const replaceConcursoWithCourse = (text) => {
    if (!text || !courseName) return text
    return text
      .replace(/Legislação Especial para o Concurso da [^<)]+/gi, `Legislação Especial para o ${courseName}`)
      .replace(/Câmara Municipal de [^<)]+/gi, courseName)
      .replace(/Concurso da Câmara Municipal de [^<)]+/gi, courseName)
      .replace(/Concurso público da [^<)]+/gi, courseName)
      .replace(/concurso público da [^<)]+/gi, courseName)
      .replace(/\s*\(Cargos?\s+\d+[^)]*\)/gi, '')
      .replace(/\s*\([^)]*Policial[^)]*\)/gi, '')
      .replace(/para os cargos [^<)]+/gi, `para o ${courseName}`)
      .replace(/para o cargo [^<)]+/gi, `para o ${courseName}`)
      .replace(/\s*-\s*[A-Z]{2}\s*/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  }

  useEffect(() => {
    const loadConteudo = async () => {
      if (!resolvedTopicKey || !resolvedCourseId) {
        setError('Conteúdo não encontrado')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError('')

        // 1) Tentar doc com ID = topicKey
        const directRef = doc(db, 'courses', resolvedCourseId, 'conteudosCompletos', resolvedTopicKey)
        const directDoc = await getDoc(directRef)
        if (directDoc.exists()) {
          setConteudo({ id: directDoc.id, ...directDoc.data() })
          setLoading(false)
          return
        }

        // 2) Tentar buscar por numero ou materia igual ao topicKey
        const conteudosRef = collection(db, 'courses', resolvedCourseId, 'conteudosCompletos')
        const qNumero = query(conteudosRef, where('numero', '==', resolvedTopicKey), limit(1))
        const numeroSnap = await getDocs(qNumero)
        if (!numeroSnap.empty) {
          const docSnap = numeroSnap.docs[0]
          setConteudo({ id: docSnap.id, ...docSnap.data() })
          setLoading(false)
          return
        }

        const qMateria = query(conteudosRef, where('materia', '==', resolvedTopicKey), limit(1))
        const materiaSnap = await getDocs(qMateria)
        if (!materiaSnap.empty) {
          const docSnap = materiaSnap.docs[0]
          setConteudo({ id: docSnap.id, ...docSnap.data() })
          setLoading(false)
          return
        }

        setError('Conteúdo completo não encontrado para este tópico.')
        setLoading(false)
      } catch (err) {
        console.error('Erro ao carregar conteúdo completo:', err)
        setError('Erro ao carregar conteúdo. Tente novamente.')
        setLoading(false)
      }
    }

    loadConteudo()
  }, [resolvedTopicKey, resolvedCourseId])

  const handleGenerateContent = async () => {
    if (!resolvedCourseId || !resolvedTopicKey) return
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) {
      setError('API Key não configurada.')
      return
    }

    try {
      setGenerating(true)
      setProgress(5)
      setError('')

      // Carregar edital e prompt unificado para contexto
      const editalRef = doc(db, 'courses', resolvedCourseId, 'prompts', 'edital')
      const editalDoc = await getDoc(editalRef)
      const editalData = editalDoc.exists() ? editalDoc.data() : {}
      const editalText = (editalData.pdfText || editalData.prompt || '').toString()

      if (!editalText || editalText.trim().length === 0) {
        throw new Error('Edital não encontrado para este curso. Gere o edital primeiro.')
      }

      const unifiedRef = doc(db, 'courses', resolvedCourseId, 'prompts', 'unified')
      const unifiedDoc = await getDoc(unifiedRef)
      const unifiedData = unifiedDoc.exists() ? unifiedDoc.data() : {}
      const banca = unifiedData.banca || ''
      const concursoName = unifiedData.concursoName || ''
      setProgress(25)

      const genAI = new GoogleGenerativeAI(apiKey)
      const modelNames = ['gemini-2.0-flash', 'gemini-1.5-pro-latest', 'gemini-1.5-flash-latest']
      let aiText = ''
      let lastError = null

      const prompt = `Você é um especialista em criar conteúdo técnico completo para cursos preparatórios.

CONTEXTO (não cite estes nomes no texto final):
${banca ? `BANCA: ${banca}\n` : ''}${concursoName ? `CONCURSO: ${concursoName}\n` : ''}CURSO: ${courseName || 'Curso Preparatório'}
TÓPICO DO EDITAL: ${resolvedTopicKey}

EDITAL BASE (trecho):
${editalText.substring(0, 6000)}${editalText.length > 6000 ? '\n\n[texto truncado]' : ''}

TAREFA:
Crie um conteúdo COMPLETO e DETALHADO para o tópico acima, com linguagem técnica e formal.

FORMATO DE RESPOSTA (APENAS JSON VÁLIDO):
{
  "titulo": "Título do conteúdo",
  "materia": "Nome da matéria ou tópico",
  "subtitulo": "Subtítulo opcional",
  "numero": "Mesma numeração do tópico do edital, se aplicável",
  "content": "Conteúdo principal em HTML",
  "secoes": [
    {
      "titulo": "Nome da seção",
      "tipo": "lei|sumula|entendimento|conceito",
      "conteudo": "Conteúdo HTML da seção"
    }
  ],
  "tags": ["lista", "de", "tags"]
}

REGRAS:
- Não mencione concurso, prefeitura ou banca no texto final.
- Se usar numeração, mantenha a mesma numeração do tópico.
- Use HTML sem markdown.
- Comece diretamente com { e termine com } (JSON parseável).`

      for (const modelName of modelNames) {
        try {
          setProgress((prev) => Math.min(prev + 15, 70))
          const model = genAI.getGenerativeModel({ model: modelName })
          const result = await model.generateContent(prompt)
          aiText = result.response.text().trim()
          if (aiText) break
        } catch (err) {
          lastError = err
          continue
        }
      }

      if (!aiText) {
        throw lastError || new Error('Falha ao gerar conteúdo com a IA.')
      }
      setProgress(75)

      let jsonText = aiText
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '').trim()
      }
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
      if (jsonMatch) jsonText = jsonMatch[0]

      const parsed = JSON.parse(jsonText)
      const payload = {
        ...parsed,
        materia: parsed.materia || parsed.titulo || resolvedTopicKey,
        numero: parsed.numero || resolvedTopicKey,
        updatedAt: serverTimestamp(),
        generatedAt: serverTimestamp(),
      }

      await setDoc(doc(db, 'courses', resolvedCourseId, 'conteudosCompletos', resolvedTopicKey), payload, { merge: true })
      setConteudo({ id: resolvedTopicKey, ...payload })
      setError('')
      setProgress(100)
    } catch (err) {
      console.error('Erro ao gerar conteúdo:', err)
      const message = err instanceof Error ? err.message : String(err)
      setError(message || 'Erro ao gerar conteúdo.')
    } finally {
      setGenerating(false)
      setLoading(false)
      setTimeout(() => setProgress(0), 800)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center space-y-4 w-full max-w-md px-6">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-alego-600 border-t-transparent"></div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Carregando conteúdo completo...
          </p>
          {generating && (
            <>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-2 bg-alego-600 dark:bg-alego-400 transition-all duration-300"
                  style={{ width: `${Math.max(progress, 10)}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                A IA está gerando o conteúdo deste tópico. Não feche nem atualize a página até concluir.
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  if (error || !conteudo) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 text-center space-y-4">
          <h2 className="text-2xl font-bold text-red-600 dark:text-red-400">
            {error || 'Conteúdo não encontrado'}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Tópico: <span className="font-semibold">{resolvedTopicKey}</span>
          </p>
          {generating && (
            <div className="space-y-3">
              <div className="w-full max-w-md mx-auto h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-2 bg-alego-600 dark:bg-alego-400 transition-all duration-300"
                  style={{ width: `${Math.max(progress, 15)}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Gerando conteúdo específico deste tópico. Isso pode levar alguns instantes, não feche a página.
              </p>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={handleGenerateContent}
              disabled={generating}
              className="inline-flex items-center gap-2 px-4 py-2 bg-alego-600 text-white rounded-lg hover:bg-alego-700 transition disabled:opacity-60"
            >
              {generating ? (
                <>
                  <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Gerando conteúdo...
                </>
              ) : (
                <>
                  <span role="img" aria-label="raio">⚡</span>
                  Gerar conteúdo agora
                </>
              )}
            </button>
            <Link
              to="/conteudo-completo"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-white rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition"
            >
              <ArrowLeftIcon className="w-5 h-5" />
              Voltar para Conteúdos Completos
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
      <Link
        to="/edital-verticalizado"
        className="inline-flex items-center gap-2 mb-6 text-alego-600 dark:text-alego-400 hover:text-alego-700 dark:hover:text-alego-300 transition"
      >
        <ArrowLeftIcon className="w-5 h-5" />
        <span>Voltar ao Edital Verticalizado</span>
      </Link>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 sm:p-8 lg:p-10">
        <div className="mb-8 pb-6 border-b border-slate-200 dark:border-slate-700">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Tópico</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-alego-600 dark:text-alego-400 mb-2 break-words">
            {conteudo.materia || conteudo.titulo || resolvedTopicKey}
          </h1>
          {conteudo.titulo && conteudo.titulo !== conteudo.materia && (
            <h2 className="text-2xl sm:text-3xl font-semibold text-slate-700 dark:text-slate-300 mb-2">
              {conteudo.titulo}
            </h2>
          )}
          {conteudo.subtitulo && (
            <p className="text-lg text-slate-600 dark:text-slate-400 italic">
              {replaceConcursoWithCourse(conteudo.subtitulo)}
            </p>
          )}
        </div>

        <div className="prose prose-lg dark:prose-invert max-w-none">
          {courseName && (
            <div className="mb-6 p-4 bg-alego-50 dark:bg-alego-900/20 border-l-4 border-alego-500 rounded-r-lg">
              <p className="text-slate-700 dark:text-slate-300 text-base leading-relaxed">
                <strong>Este material foi elaborado para o curso <span className="text-alego-600 dark:text-alego-400 font-semibold">{courseName}</span>.</strong> Use-o para estudar este tópico específico do edital.
              </p>
            </div>
          )}

          {conteudo.content && (
            <div
              className="mb-8 text-slate-700 dark:text-slate-300"
              dangerouslySetInnerHTML={{ __html: replaceConcursoWithCourse(conteudo.content) }}
            />
          )}

          {conteudo.secoes && Array.isArray(conteudo.secoes) && conteudo.secoes.length > 0 && (
            <div className="space-y-8 mt-8">
              {conteudo.secoes.map((secao, index) => (
                <div
                  key={index}
                  className="border-l-4 border-alego-500 pl-6 py-3 bg-slate-50 dark:bg-slate-900/50 rounded-r-lg"
                >
                  <h3 className="text-xl sm:text-2xl font-semibold text-alego-600 dark:text-alego-400 mb-3">
                    {secao.titulo || `Seção ${index + 1}`}
                    {secao.tipo && (
                      <span className="ml-3 text-sm bg-alego-100 dark:bg-alego-900 text-alego-700 dark:text-alego-300 px-3 py-1 rounded-full">
                        {secao.tipo}
                      </span>
                    )}
                  </h3>
                  {secao.conteudo && (
                    <div
                      className="text-slate-700 dark:text-slate-300"
                      dangerouslySetInnerHTML={{ __html: replaceConcursoWithCourse(secao.conteudo) }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ConteudoCompletoTopicoView

