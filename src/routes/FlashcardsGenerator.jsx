import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { doc, getDoc, collection, query, where, orderBy, onSnapshot, writeBatch, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode'
import {
  ChevronLeftIcon,
  SparklesIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

export default function FlashcardsGenerator() {
  const { user } = useAuth()
  const { darkMode } = useDarkMode()
  const navigate = useNavigate()
  const location = useLocation()

  // Estados
  const [loading, setLoading] = useState(true)
  const [courseName, setCourseName] = useState('')
  const [courseId, setCourseId] = useState('')
  const [generatingFlashcards, setGeneratingFlashcards] = useState(false)
  const [generationStatus, setGenerationStatus] = useState('')
  const [selectedDisciplina, setSelectedDisciplina] = useState(null)
  const [selectedTopico, setSelectedTopico] = useState(null)
  const [editalVerticalizado, setEditalVerticalizado] = useState(null)
  const [userFlashcards, setUserFlashcards] = useState([])

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }

    // Obter parâmetros do state
    const disciplina = location.state?.disciplina
    const topico = location.state?.topico
    const topicoNumero = location.state?.topicoNumero
    const courseIdParam = location.state?.courseId

    if (!disciplina || !topico || !courseIdParam) {
      navigate('/flashcards2.0')
      return
    }

    setCourseId(courseIdParam)
    setSelectedDisciplina({ nome: disciplina })
    setSelectedTopico({ nome: topico, numero: topicoNumero })

    // Carregar dados
    loadCourseName(courseIdParam)
    loadEditalAndFlashcards(courseIdParam)
  }, [user, navigate, location])

  // Carregar nome do curso
  const loadCourseName = async (courseId) => {
    try {
      const courseDoc = await getDoc(doc(db, 'courses', courseId))
      if (courseDoc.exists()) {
        const data = courseDoc.data()
        setCourseName(data.name || data.competition || '')
      }
    } catch (error) {
      console.error('Erro ao carregar nome do curso:', error)
    }
  }

  // Carregar edital verticalizado e flashcards do usuário
  const loadEditalAndFlashcards = async (courseId) => {
    setLoading(true)
    try {
      // Carregar edital verticalizado
      console.log('Carregando edital para courseId:', courseId)
      const editalRef = doc(db, 'courses', courseId, 'editalVerticalizado', 'principal')
      
      const loadEditalCompleto = async () => {
        try {
          console.log('Carregando edital do courseId:', courseId)
          const snapshot = await getDoc(editalRef)
          if (!snapshot.exists()) {
            console.log('Documento não encontrado')
            setEditalVerticalizado(null)
            return
          }
          
          const data = snapshot.data()
          console.log('Dados carregados:', {
            temPartes: data.temPartes,
            totalPartes: data.totalPartes,
            disciplinasPrincipais: data.disciplinas?.length || 0
          })
          
          // Verificar se o edital está dividido em partes
          if (data.temPartes && data.totalPartes > 1) {
            console.log('Carregando edital dividido em partes...')
            
            // Carregar todas as partes
            const partesRef = collection(db, 'courses', courseId, 'editalVerticalizado', 'principal', 'partes')
            const partesSnapshot = await getDocs(query(partesRef, orderBy('parte')))
            
            const todasDisciplinas = [...(data.disciplinas || [])]
            
            partesSnapshot.forEach((doc) => {
              const parteData = doc.data()
              if (parteData.disciplinas && Array.isArray(parteData.disciplinas)) {
                todasDisciplinas.push(...parteData.disciplinas)
                console.log(`Parte ${parteData.parte}: ${parteData.disciplinas.length} disciplinas`)
              }
            })
            
            setEditalVerticalizado({
              ...data,
              disciplinas: todasDisciplinas
            })
          } else {
            // Edital não dividido em partes
            setEditalVerticalizado(data)
          }
        } catch (error) {
          console.error('Erro ao carregar edital:', error)
          setEditalVerticalizado(null)
        }
      }

      await loadEditalCompleto()

      // Carregar flashcards do usuário
      await loadUserFlashcards()
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  // Carregar flashcards do usuário
  const loadUserFlashcards = async () => {
    if (!user || !courseId) return

    try {
      console.log('Carregando flashcards do usuário...')
      
      const flashcardsQuery = query(
        collection(db, 'users', user.uid, 'flashcards'),
        where('courseId', '==', courseId),
        limit(1000)
      )

      const unsubscribeFlashcards = onSnapshot(flashcardsQuery, (snapshot) => {
        console.log(`Flashcards carregados: ${snapshot.docs.length} documentos`)
        
        const flashcardsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        
        // Ordenar localmente por createdAt
        flashcardsData.sort((a, b) => {
          const dateA = a.createdAt?.toMillis?.() || a.createdAt?.seconds * 1000 || 0
          const dateB = b.createdAt?.toMillis?.() || b.createdAt?.seconds * 1000 || 0
          return dateB - dateA
        })
        
        console.log('Flashcards processados e ordenados')
        setUserFlashcards(flashcardsData)
      }, (error) => {
        console.error('Erro no listener de flashcards:', error)
        setUserFlashcards([])
      })

      return unsubscribeFlashcards
    } catch (error) {
      console.error('Erro ao carregar flashcards:', error)
      setUserFlashcards([])
    }
  }

  // Gerar flashcards baseados no conteúdo do edital
  const generateFlashcardsFromContent = async () => {
    if (!selectedDisciplina || !selectedTopico || !courseId) return

    // Verificar limite de 50 flashcards por tópico
    const topicFlashcards = userFlashcards.filter(card => 
      card.materia === selectedDisciplina.nome && 
      card.topico === selectedTopico.nome
    )
    
    if (topicFlashcards.length >= 50) {
      alert(`Este tópico já possui ${topicFlashcards.length} flashcards. O limite máximo é de 50 flashcards por tópico para melhor performance.`)
      return
    }

    setGeneratingFlashcards(true)
    setGenerationStatus('Preparando conteúdo para geração...')

    try {
      console.log('Iniciando geração direta de flashcards com IA...')
      
      // Gerar flashcards diretamente com IA baseado no tópico
      const topicInfo = {
        disciplina: selectedDisciplina.nome,
        topicoNumero: selectedTopico.numero || '',
        topicoNome: selectedTopico.nome || '',
        curso: courseName
      }
      
      console.log('Informações do tópico:', topicInfo)
      setGenerationStatus('Gerando flashcards com IA...')

      // Função para gerar flashcards em partes
      const generateFlashcardsInParts = async () => {
        const allFlashcards = []
        const parts = 2 // Gerar em 2 partes de 5 flashcards cada
        const flashcardsPerPart = 5

        for (let part = 0; part < parts; part++) {
          setGenerationStatus(`Gerando flashcards - Parte ${part + 1} de ${parts}...`)
          
          const prompt = `Gere ${flashcardsPerPart} flashcards educacionais de alta qualidade sobre o tópico abaixo.

CONTEXTO:
- Curso: ${courseName}
- Disciplina: ${selectedDisciplina.nome}
- Tópico: ${selectedTopico.numero} ${selectedTopico.nome}

INSTRUÇÕES:
1. Gere EXATAMENTE ${flashcardsPerPart} flashcards
2. Cada flashcard deve ser uma pergunta direta sobre o conteúdo
3. As respostas devem ser claras, completas e educacionais
4. Use seu conhecimento sobre ${selectedDisciplina.nome} para criar flashcards relevantes
5. Adapte o nível de dificuldade para estudantes de concurso público
6. Formato JSON:
{
  "flashcards": [
    {
      "pergunta": "pergunta clara e direta",
      "resposta": "resposta detalhada e explicativa",
      "dificuldade": "fácil|médio|difícil"
    }
  ]
}

REGRAS IMPORTANTES:
- Crie conteúdo educacional relevante para ${selectedDisciplina.nome}
- Seja didático e focado em aprendizado
- Perguntas devem testar conhecimento real
- Respostas devem ensinar e explicar conceitos
- Linguagem formal e técnica adequada para concursos
- Seja conciso e direto
- Foque nos pontos mais importantes do tópico

IMPORTANTE: Retorne APENAS o JSON válido, sem markdown ou explicações.`

          // Verificar API Key
          const apiKey = import.meta.env.VITE_GEMINI_API_KEY
          if (!apiKey) {
            console.log('API Key não encontrada!')
            throw new Error('API Key da Gemini não configurada. Verifique o arquivo .env')
          }

          console.log(`Gerando parte ${part + 1} de ${parts}...`)
          
          // Chamar API da Gemini
          const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: prompt
                }]
              }],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2000, // Reduzido para evitar truncamento
              }
            })
          })

          if (!response.ok) {
            const errorData = await response.text()
            console.log('Erro na API da IA:', response.status, errorData)
            throw new Error(`Erro na API da IA: ${response.status} - ${errorData}`)
          }

          const data = await response.json()
          const generatedText = data.candidates[0]?.content?.parts[0]?.text

          console.log(`Resposta bruta da IA - Parte ${part + 1}:`, generatedText.substring(0, 300) + '...')

          // Extrair JSON da resposta com tratamento mais robusto
          let flashcardsData = null
          try {
            // Tentar diferentes métodos de extração de JSON
            let jsonString = null
            
            // Método 1: Procurar por ```json ... ``` (prioridade máxima)
            const codeBlockMatch = generatedText.match(/```json\s*([\s\S]*?)\s*```/)
            if (codeBlockMatch) {
              jsonString = codeBlockMatch[1]
              console.log('JSON encontrado em bloco de código')
            }
            
            // Método 2: Procurar por { ... } completo
            if (!jsonString) {
              const jsonMatch = generatedText.match(/\{[\s\S]*\}/)
              if (jsonMatch) {
                jsonString = jsonMatch[0]
                console.log('JSON encontrado com regex de objeto')
              }
            }
            
            // Método 3: Procurar por array diretamente
            if (!jsonString) {
              const arrayMatch = generatedText.match(/\[[\s\S]*\]/)
              if (arrayMatch) {
                jsonString = '{"flashcards":' + arrayMatch[0] + '}'
                console.log('JSON encontrado com regex de array')
              }
            }
            
            if (!jsonString) {
              console.log('JSON não encontrado na resposta')
              console.log('Resposta bruta:', generatedText.substring(0, 300) + '...')
              throw new Error('JSON não encontrado na resposta')
            }
            
            console.log('JSON extraído:', jsonString.substring(0, 200) + '...')
            
            // Limpar o JSON antes de fazer parse
            jsonString = jsonString
              .replace(/,\s*}/g, '}')  // Remove vírgulas antes de }
              .replace(/,\s*]/g, ']')  // Remove vírgulas antes de ]
              .replace(/\n/g, '')      // Remove quebras de linha
              .replace(/\r/g, '')      // Remove carriage returns
              .replace(/\t/g, '')      // Remove tabs
              .trim()
            
            flashcardsData = JSON.parse(jsonString)
            
            console.log(`JSON parseado com sucesso - Parte ${part + 1}:`, flashcardsData.flashcards?.length || 0, 'flashcards')
          } catch (parseError) {
            console.error('Erro ao fazer parse do JSON:', parseError)
            console.error('Resposta completa da IA:', generatedText)
            throw new Error('Formato inválido na resposta da IA: ' + parseError.message)
          }

          if (!flashcardsData.flashcards || !Array.isArray(flashcardsData.flashcards)) {
            throw new Error('Estrutura de flashcards inválida')
          }

          allFlashcards.push(...flashcardsData.flashcards)
          
          // Pequena pausa entre as chamadas para não sobrecarregar a API
          if (part < parts - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        }

        return allFlashcards
      }

      const flashcardsData = { flashcards: await generateFlashcardsInParts() }

      setGenerationStatus(`Salvando ${flashcardsData.flashcards.length} flashcards...`)

      // Salvar flashcards no Firestore
      console.log('Iniciando salvamento de flashcards no Firestore...')
      
      const batch = writeBatch(db)
      
      flashcardsData.flashcards.forEach((flashcard, index) => {
        const docRef = doc(collection(db, 'users', user.uid, 'flashcards'))
        console.log(`Preparando flashcard ${index + 1}:`, flashcard.pergunta.substring(0, 50) + '...')
        
        batch.set(docRef, {
          pergunta: flashcard.pergunta,
          resposta: flashcard.resposta,
          materia: selectedDisciplina.nome,
          topico: selectedTopico.nome,
          topicoNumero: selectedTopico.numero,
          dificuldade: flashcard.dificuldade || 'médio',
          courseId: courseId,
          courseName: courseName,
          userId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          reviewCount: 0,
          lastReview: null,
          order: index
        })
      })

      console.log('Executando batch commit...')
      await batch.commit()
      
      setGenerationStatus(`Flashcards gerados com sucesso!`)
      
      // Fechar e redirecionar após 2 segundos
      setTimeout(() => {
        navigate('/flashcards2.0')
      }, 2000)
      
    } catch (error) {
      console.error('Erro ao gerar flashcards:', error)
      setGenerationStatus(`Erro: ${error.message}`)
    } finally {
      setGeneratingFlashcards(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">Carregando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 py-4 sm:py-6">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <button
            onClick={() => navigate('/flashcards2.0')}
            className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 mb-3 sm:mb-4 text-sm sm:text-base"
          >
            <ChevronLeftIcon className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="hidden sm:inline">Voltar para Flashcards</span>
            <span className="sm:hidden">Voltar</span>
          </button>
          
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 dark:text-white mb-2">
              GERAR FLASHCARDS
            </h1>
            {courseName && (
              <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400 mb-2">
                {courseName}
              </p>
            )}
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400">
              {selectedDisciplina?.nome} - {selectedTopico?.numero} {selectedTopico?.nome}
            </p>
          </div>
        </div>

        {/* Card de Geração */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 sm:p-8">
          <div className="space-y-6">
            {/* Informações */}
            <div className="text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Serão gerados <span className="font-bold text-blue-600 dark:text-blue-400">10 flashcards</span> para este tópico
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                Limite máximo: 50 flashcards por tópico
              </p>
            </div>

            {/* Status da Geração */}
            {generationStatus && (
              <div className={`p-4 rounded-lg ${
                generatingFlashcards 
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' 
                  : generationStatus.includes('sucesso')
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
              }`}>
                <p className="text-sm font-medium">{generationStatus}</p>
              </div>
            )}

            {/* Botões */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={() => navigate('/flashcards2.0')}
                className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                disabled={generatingFlashcards}
              >
                Cancelar
              </button>
              <button
                onClick={generateFlashcardsFromContent}
                disabled={generatingFlashcards}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {generatingFlashcards ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Gerando...
                  </>
                ) : (
                  <>
                    <SparklesIcon className="w-4 h-4" />
                    Gerar 10 Flashcards
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Informações Adicionais */}
        <div className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
          <p>Os flashcards serão gerados com base no conteúdo do tópico selecionado.</p>
          <p>Limite máximo de 50 flashcards por tópico para melhor performance.</p>
        </div>
      </div>
    </div>
  )
}
