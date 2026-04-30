import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { doc, getDoc, collection, query, where, orderBy, onSnapshot, writeBatch, serverTimestamp, limit, addDoc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode'
import {
  ChevronLeftIcon,
  BookOpenIcon,
  SparklesIcon,
  XMarkIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline'

export default function Flashcards2_0() {
  const { user, profile } = useAuth()
  const { darkMode } = useDarkMode()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Estados para estrutura do edital
  const [editalVerticalizado, setEditalVerticalizado] = useState(null)
  const [courseId, setCourseId] = useState(null)
  const [courseName, setCourseName] = useState('')
  const [loading, setLoading] = useState(true)

  // Estados para seleção e geração
  const [selectedDisciplina, setSelectedDisciplina] = useState(null)
  const [selectedTopico, setSelectedTopico] = useState(null)
  const [flashcardCount, setFlashcardCount] = useState(10)

  // Estados para flashcards gerados
  const [userFlashcards, setUserFlashcards] = useState([])
  const [selectedCard, setSelectedCard] = useState(null)
  const [isFlipped, setIsFlipped] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  
  // Estados para visualização de flashcards por tópico
  const [showTopicFlashcards, setShowTopicFlashcards] = useState(false)
  const [selectedTopicFlashcards, setSelectedTopicFlashcards] = useState([])
  const [currentCardIndex, setCurrentCardIndex] = useState(0)
  const [selectedTopicInfo, setSelectedTopicInfo] = useState(null)

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }

    const courseFromUrl = searchParams.get('course')
    const courseFromProfile = profile?.selectedCourseId
    const finalCourseId = courseFromUrl || courseFromProfile || 'alego-default'
    setCourseId(finalCourseId)

    // Carregar edital verticalizado e flashcards do usuário
    loadEditalAndFlashcards(finalCourseId)
  }, [user, navigate, searchParams, profile])

  // Carregar flashcards do usuário com otimização
  const loadUserFlashcards = async () => {
    if (!user || !courseId) return

    try {
      console.log('Carregando flashcards do usuário...')
      
      // Query com limite para melhor performance
      const flashcardsQuery = query(
        collection(db, 'users', user.uid, 'flashcards'),
        where('courseId', '==', courseId),
        limit(1000) // Limitar para evitar sobrecarga
      )

      // Timeout para evitar carregamento infinito
      const timeoutId = setTimeout(() => {
        console.log('Timeout no carregamento de flashcards, usando cache local se disponível')
      }, 10000) // 10 segundos

      const unsubscribeFlashcards = onSnapshot(flashcardsQuery, (snapshot) => {
        clearTimeout(timeoutId)
        
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
        clearTimeout(timeoutId)
        console.error('Erro no listener de flashcards:', error)
        // Tentar carregar uma vez se o listener falhar
        loadFlashcardsOnce()
      })

      // Função de fallback para carregar uma vez
      const loadFlashcardsOnce = async () => {
        try {
          const snapshot = await getDocs(flashcardsQuery)
          const flashcardsData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }))
          
          flashcardsData.sort((a, b) => {
            const dateA = a.createdAt?.toMillis?.() || a.createdAt?.seconds * 1000 || 0
            const dateB = b.createdAt?.toMillis?.() || b.createdAt?.seconds * 1000 || 0
            return dateB - dateA
          })
          
          setUserFlashcards(flashcardsData)
          console.log('Flashcards carregados via fallback (getDocs)')
        } catch (fallbackError) {
          console.error('Erro no fallback de flashcards:', fallbackError)
          setUserFlashcards([]) // Setar array vazio para não quebrar a UI
        }
      }

      return unsubscribeFlashcards
    } catch (error) {
      console.error('Erro ao carregar flashcards:', error)
      setUserFlashcards([]) // Setar array vazio para não quebrar a UI
    }
  }

  // Carregar edital verticalizado
  const loadEditalAndFlashcards = async (courseId) => {
    setLoading(true)
    try {
      // Carregar nome do curso
      const courseDoc = await getDoc(doc(db, 'courses', courseId))
      if (courseDoc.exists()) {
        const data = courseDoc.data()
        setCourseName(data.name || data.competition || '')
      }

      // Carregar edital verticalizado - usar mesmo caminho do EditalVerticalizado.jsx
      console.log('🎯 Flashcards2.0: Carregando edital para courseId:', courseId)
      const editalRef = doc(db, 'courses', courseId, 'editalVerticalizado', 'principal')
      
      const loadEditalCompleto = async () => {
        try {
          console.log('📋 Flashcards2.0: Carregando edital do courseId:', courseId)
          const snapshot = await getDoc(editalRef)
          if (!snapshot.exists()) {
            console.log('❌ Flashcards2.0: Documento não encontrado')
            setEditalVerticalizado(null)
            return
          }
          
          const data = snapshot.data()
          console.log('📊 Flashcards2.0: Dados carregados:', {
            temPartes: data.temPartes,
            totalPartes: data.totalPartes,
            disciplinasPrincipais: data.disciplinas?.length || 0
          })
          
          // Verificar se o edital está dividido em partes
          if (data.temPartes && data.totalPartes > 1) {
            console.log('📦 Flashcards2.0: Carregando edital dividido em partes...')
            
            // Carregar todas as partes
            const partesRef = collection(db, 'courses', courseId, 'editalVerticalizado', 'principal', 'partes')
            const partesSnapshot = await getDocs(query(partesRef, orderBy('parte')))
            
            const todasDisciplinas = [...(data.disciplinas || [])]
            
            partesSnapshot.forEach((doc) => {
              const parteData = doc.data()
              if (parteData.disciplinas && Array.isArray(parteData.disciplinas)) {
                todasDisciplinas.push(...parteData.disciplinas)
                console.log(`📋 Parte ${parteData.parte}: ${parteData.disciplinas.length} disciplinas`)
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
          console.error('❌ Flashcards2.0: Erro ao carregar edital:', error)
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

  // Gerar flashcards baseados no conteúdo do edital
  const generateFlashcardsFromContent = async () => {
    if (!selectedDisciplina || !selectedTopico || !courseId) return

    console.log('🎯 Iniciando geração de flashcards:', {
      disciplina: selectedDisciplina.nome,
      topico: selectedTopico.nome,
      courseId: courseId,
      userId: user?.uid
    })

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

      // Prompt para gerar flashcards diretamente baseado no tópico
      const prompt = `Gere ${flashcardCount} flashcards educacionais de alta qualidade sobre o tópico abaixo.

CONTEXTO:
- Curso: ${courseName}
- Disciplina: ${selectedDisciplina.nome}
- Tópico: ${selectedTopico.numero} ${selectedTopico.nome}

TÓPICO:
${selectedDisciplina.nome} - ${selectedTopico.numero} ${selectedTopico.nome}

INSTRUÇÕES:
1. Gere EXATAMENTE ${flashcardCount} flashcards
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
- Foque nos pontos mais importantes do tópico

IMPORTANTE: Retorne APENAS o JSON válido, sem markdown ou explicações.`

      // Verificar API Key
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey) {
        console.log('API Key não encontrada!')
        throw new Error('API Key da Gemini não configurada. Verifique o arquivo .env')
      }

      console.log('API Key encontrada, iniciando chamada da IA...')
      
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
            maxOutputTokens: 4000,
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

      console.log('Resposta bruta da IA:', generatedText.substring(0, 500) + '...')

      // Extrair JSON da resposta com tratamento mais robusto
      let flashcardsData = null
      try {
        // Tentar diferentes métodos de extração de JSON
        let jsonString = null
        
        // Método 1: Procurar por { ... } completo
        const jsonMatch = generatedText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          jsonString = jsonMatch[0]
        }
        
        // Método 2: Procurar por ```json ... ```
        if (!jsonString) {
          const codeBlockMatch = generatedText.match(/```json\s*([\s\S]*?)\s*```/)
          if (codeBlockMatch) {
            jsonString = codeBlockMatch[1]
          }
        }
        
        // Método 3: Procurar por array diretamente
        if (!jsonString) {
          const arrayMatch = generatedText.match(/\[[\s\S]*\]/)
          if (arrayMatch) {
            jsonString = '{"flashcards":' + arrayMatch[0] + '}'
          }
        }
        
        if (!jsonString) {
          console.log('JSON não encontrado na resposta')
          throw new Error('JSON não encontrado na resposta')
        }
        
        console.log('JSON extraído:', jsonString.substring(0, 200) + '...')
        
        // Limpar o JSON antes de fazer parse
        jsonString = jsonString
          .replace(/,\s*}/g, '}')  // Remove vírgulas antes de }
          .replace(/,\s*]/g, ']')  // Remove vírgulas antes de ]
          .replace(/\n/g, '')      // Remove quebras de linha
          .replace(/\r/g, '')      // Remove carriage returns
          .trim()
        
        flashcardsData = JSON.parse(jsonString)
        
        console.log('JSON parseado com sucesso:', flashcardsData)
      } catch (parseError) {
        console.error('Erro ao fazer parse do JSON:', parseError)
        console.error('Resposta completa da IA:', generatedText)
        throw new Error('Formato inválido na resposta da IA: ' + parseError.message)
      }

      if (!flashcardsData.flashcards || !Array.isArray(flashcardsData.flashcards)) {
        throw new Error('Estrutura de flashcards inválida')
      }

      setGenerationStatus(`Salvando ${flashcardsData.flashcards.length} flashcards...`)

      // Salvar flashcards no Firestore
      console.log('💾 Iniciando salvamento de flashcards no Firestore...')
      console.log('📋 Coleção: users/' + user.uid + '/flashcards')
      
      const batch = writeBatch(db)
      
      flashcardsData.flashcards.forEach((flashcard, index) => {
        const docRef = doc(collection(db, 'users', user.uid, 'flashcards'))
        console.log(`📝 Preparando flashcard ${index + 1}:`, flashcard.pergunta.substring(0, 50) + '...')
        
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

      console.log('🚀 Executando batch commit...')
      await batch.commit()
      
      setGenerationStatus(`✅ ${flashcardsData.flashcards.length} flashcards gerados com sucesso!`)
      
      // Fechar modal após 2 segundos
      setTimeout(() => {
        setShowGenerationModal(false)
        setGenerationStatus('')
        setSelectedDisciplina(null)
        setSelectedTopico(null)
      }, 2000)

    } catch (error) {
      console.error('Erro ao gerar flashcards:', error)
      setGenerationStatus(`❌ Erro: ${error.message}`)
    } finally {
      setGeneratingFlashcards(false)
    }
  }

  // Abrir página de geração de flashcards
  const openGenerationPage = (disciplina, topico) => {
    // Verificar limite de 50 flashcards por tópico
    const topicFlashcards = userFlashcards.filter(card => 
      card.materia === disciplina.nome && 
      card.topico === topico.nome
    )
    
    if (topicFlashcards.length >= 50) {
      alert(`Este tópico já possui ${topicFlashcards.length} flashcards. O limite máximo é de 50 flashcards por tópico para melhor performance.`)
      return
    }
    
    // Navegar para página de geração com parâmetros
    navigate('/flashcards-generator', {
      state: {
        disciplina: disciplina.nome,
        topico: topico.nome,
        topicoNumero: topico.numero,
        courseId: courseId
      }
    })
  }

  // Abrir página de visualização de flashcards do tópico
  const openTopicFlashcardsPage = (disciplina, topico) => {
    const topicFlashcards = userFlashcards.filter(card => 
      card.materia === disciplina.nome && 
      card.topico === topico.nome
    )
    
    if (topicFlashcards.length === 0) {
      alert('Nenhum flashcard encontrado para este tópico.')
      return
    }

    // Limitar a 50 flashcards mais recentes para melhor performance
    const limitedFlashcards = topicFlashcards.slice(0, 50)
    
    if (topicFlashcards.length > 50) {
      console.log(`Limitando exibição para 50 flashcards mais recentes de ${topicFlashcards.length} totais`)
    }

    // Navegar para página de visualização com parâmetros
    navigate('/flashcards-viewer', {
      state: {
        disciplina: disciplina.nome,
        topico: topico.nome,
        topicoNumero: topico.numero,
        courseId: courseId,
        flashcards: limitedFlashcards // Passar flashcards já limitados
      }
    })
  }

  // Navegação entre flashcards
  const nextCard = () => {
    if (currentCardIndex < selectedTopicFlashcards.length - 1) {
      setCurrentCardIndex(currentCardIndex + 1)
      setIsFlipped(false)
    }
  }

  const prevCard = () => {
    if (currentCardIndex > 0) {
      setCurrentCardIndex(currentCardIndex - 1)
      setIsFlipped(false)
    }
  }

  // Excluir flashcard
  const deleteFlashcard = async (flashcardId) => {
    if (!confirm('Tem certeza que deseja excluir este flashcard?')) return

    try {
      await deleteDoc(doc(db, 'users', user.uid, 'flashcards', flashcardId))
    } catch (error) {
      console.error('Erro ao excluir flashcard:', error)
      alert('Erro ao excluir flashcard. Tente novamente.')
    }
  }

  const filteredFlashcards = userFlashcards.filter(card =>
    card.pergunta.toLowerCase().includes(searchTerm.toLowerCase()) ||
    card.resposta.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Agrupar flashcards por matéria
  const flashcardsByMateria = userFlashcards.reduce((acc, card) => {
    const materia = card.materia || 'Sem matéria'
    if (!acc[materia]) {
      acc[materia] = []
    }
    acc[materia].push(card)
    return acc
  }, {})

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
          <p className="mt-4 text-lg font-semibold text-blue-600">Carregando flashcards...</p>
        </div>
      </div>
    )
  }

  if (!editalVerticalizado) {
    return (
      <div className="min-h-screen py-6">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-12 text-center`}>
            <DocumentTextIcon className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Edital Verticalizado não disponível
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              O edital verticalizado ainda não foi configurado para este curso.
            </p>
            <button
              onClick={() => navigate('/dashboard')}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all"
            >
              Voltar ao Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen py-4 sm:py-6">
      <div className="max-w-5xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-4 sm:mb-6 md:mb-8">
          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 mb-3 sm:mb-4 text-sm sm:text-base"
          >
            <ChevronLeftIcon className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="hidden sm:inline">Voltar ao Dashboard</span>
            <span className="sm:hidden">Voltar</span>
          </button>
          
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-2 sm:p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg sm:rounded-xl flex-shrink-0">
              <BookOpenIcon className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-black text-slate-900 dark:text-white break-words">
                FLASHCARDS {courseName ? courseName.toUpperCase() : ''}
              </h1>
            </div>
          </div>
        </div>

        {/* Conteúdo Principal */}
        <div className={`bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-2 sm:p-3 md:p-4 lg:p-6`}>
          {/* Informações sobre os flashcards */}
          <div className="mb-3 sm:mb-4 pb-2 sm:pb-3 border-b border-slate-200 dark:border-slate-700">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-slate-600 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-300 text-xs sm:text-sm">
                  {userFlashcards.length} {userFlashcards.length === 1 ? 'flashcard' : 'flashcards'}
                </span>
                <span className="font-semibold text-slate-700 dark:text-slate-300 text-xs sm:text-sm">
                  {Object.keys(flashcardsByMateria).length} {Object.keys(flashcardsByMateria).length === 1 ? 'matéria' : 'matérias'}
                </span>
              </div>
              
              {/* Search Bar */}
              <div className="w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="Buscar flashcards..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full sm:w-64 px-3 py-2 rounded-lg border text-sm ${
                    darkMode
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-500'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Tabela de Disciplinas e Tópicos */}
          {editalVerticalizado?.disciplinas && Array.isArray(editalVerticalizado.disciplinas) && editalVerticalizado.disciplinas.length > 0 ? (
            <>
              <div className="overflow-x-auto -mx-2 sm:-mx-3 md:-mx-4 lg:mx-0 scrollbar-thin scrollbar-thumb-blue-500 scrollbar-track-slate-200 dark:scrollbar-track-slate-700">
                <div className="min-w-full inline-block">
                  <table className="w-full min-w-[400px] sm:min-w-[500px] md:min-w-[600px] lg:min-w-[640px] border-collapse border border-black dark:border-slate-600 bg-white dark:bg-slate-800 text-[10px] sm:text-xs md:text-sm">
                    <thead>
                      <tr className="bg-blue-700 dark:bg-blue-800 text-white">
                        <th className="border border-black dark:border-slate-600 px-1.5 sm:px-2 md:px-3 lg:px-4 py-1.5 sm:py-2 md:py-2.5 text-left font-bold text-[9px] sm:text-xs md:text-sm">
                          <span className="sm:hidden">DISC.</span>
                          <span className="hidden sm:inline">DISCIPLINAS E TÓPICOS</span>
                        </th>
                        <th className="border border-black dark:border-slate-600 px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 md:py-2.5 text-center font-bold text-[9px] sm:text-xs md:text-sm whitespace-nowrap">
                          <span className="hidden sm:inline">Flashcards</span>
                          <span className="sm:hidden">FC</span>
                        </th>
                        <th className="border border-black dark:border-slate-600 px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 md:py-2.5 text-center font-bold text-[9px] sm:text-xs md:text-sm whitespace-nowrap">
                          <span className="hidden sm:inline">Ações</span>
                          <span className="sm:hidden">A</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {editalVerticalizado.disciplinas
                        .filter(disciplina => disciplina && disciplina.nome)
                        .map((disciplina, idx) => (
                          <React.Fragment key={idx}>
                            {/* Linha principal da disciplina */}
                            <tr className="bg-orange-500 dark:bg-orange-600 text-white font-bold">
                              <td className="border border-black dark:border-slate-600 px-1.5 sm:px-2 md:px-3 lg:px-4 py-1.5 sm:py-2 md:py-2.5 text-[10px] sm:text-xs md:text-sm lg:text-base">
                                <div className="break-words">
                                  <span className="font-bold">{disciplina.nome || 'Disciplina sem nome'}</span>
                                  {disciplina.totalQuestoes && (
                                    <span className="block sm:inline sm:ml-1 text-[9px] sm:text-xs opacity-90">
                                      ({disciplina.totalQuestoes} Q)
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="border border-black dark:border-slate-600 px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 md:py-2.5 text-center">
                                {flashcardsByMateria[disciplina.nome]?.length || 0}
                              </td>
                              <td className="border border-black dark:border-slate-600 px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 md:py-2.5 text-center"></td>
                            </tr>
                            
                            {/* Tópicos da disciplina */}
                            {disciplina.topicos && Array.isArray(disciplina.topicos) && disciplina.topicos.length > 0 && disciplina.topicos
                              .filter(topico => topico && (topico.nome || topico.numero))
                              .map((topico, topicoIdx) => {
                                const topicFlashcards = userFlashcards.filter(card => 
                                  card.materia === disciplina.nome && 
                                  card.topico === topico.nome
                                )
                                
                                return (
                                  <tr key={`${idx}-${topicoIdx}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 bg-white dark:bg-slate-800">
                                    <td 
                                      className="border border-black dark:border-slate-600 px-1.5 sm:px-2 md:px-3 lg:px-4 py-1.5 sm:py-2 text-slate-900 dark:text-white text-[9px] sm:text-xs md:text-sm break-words"
                                      style={{ paddingLeft: `${Math.max(16 + (topico.nivel || 0) * 12, 16)}px` }}
                                    >
                                      <div className="flex flex-col gap-1.5 sm:gap-2">
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-start gap-1 sm:gap-2">
                                            {topico.numero && <span className="font-medium whitespace-nowrap text-[9px] sm:text-xs">{topico.numero} </span>}
                                            <span className="break-words leading-tight">{topico.nome || ''}</span>
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="border border-black dark:border-slate-600 px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 text-center">
                                      {topicFlashcards.length}
                                    </td>
                                    <td className="border border-black dark:border-slate-600 px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 text-center">
                                      <div className="flex items-center justify-center gap-1">
                                        <button
                                          onClick={() => openGenerationPage(disciplina, topico)}
                                          className="inline-flex items-center justify-center p-1 sm:p-1.5 text-green-600 hover:text-green-800 hover:bg-green-50 dark:hover:text-green-400 dark:hover:bg-green-900/20 rounded transition-colors"
                                          title="Gerar flashcards em página separada"
                                        >
                                          <SparklesIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                                        </button>
                                        {topicFlashcards.length > 0 && (
                                          <button
                                            onClick={() => openTopicFlashcardsPage(disciplina, topico)}
                                            className="inline-flex items-center justify-center p-1 sm:p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/20 rounded transition-colors"
                                            title="Ver flashcards em página separada"
                                          >
                                            <BookOpenIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )
                              })}
                          </React.Fragment>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <DocumentTextIcon className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p>Nenhuma disciplina encontrada no edital</p>
            </div>
          )}

          {/* Flashcards do usuário */}
          {userFlashcards.length > 0 && (
            <div className="mt-8">
              <h2 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Meus Flashcards ({userFlashcards.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredFlashcards.map(card => (
                  <div
                    key={card.id}
                    onClick={() => {
                      setSelectedCard(card)
                      setIsFlipped(false)
                    }}
                    className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow p-4 cursor-pointer hover:shadow-lg transition-all`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        darkMode ? 'bg-blue-900 text-blue-300' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {card.materia}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteFlashcard(card.id)
                        }}
                        className="text-red-500 hover:text-red-700"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    <h3 className={`font-semibold mb-2 text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {card.pergunta}
                    </h3>
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} line-clamp-2`}>
                      {card.resposta}
                    </p>
                    {card.topico && (
                      <p className={`text-xs mt-2 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                        {card.topicoNumero} {card.topico}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {userFlashcards.length === 0 && (
            <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <BookOpenIcon className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p>Nenhum flashcard criado ainda</p>
              <p className="text-sm mt-2">Clique no botão de gerar flashcards em qualquer tópico acima</p>
            </div>
          )}
        </div>
      </div>

      
      {/* Modal de Visualização de Flashcards do Tópico */}
      {showTopicFlashcards && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4 px-6">
              <div>
                <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Flashcards do Tópico
                </h2>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                  {selectedTopicInfo?.disciplina} - {selectedTopicInfo?.topico}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowTopicFlashcards(false)
                  setSelectedTopicFlashcards([])
                  setCurrentCardIndex(0)
                  setIsFlipped(false)
                }}
                className={`text-gray-500 hover:text-gray-700 ${darkMode ? 'text-gray-400 hover:text-gray-200' : ''}`}
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            {selectedTopicFlashcards.length > 0 && (
              <>
                {/* Contador e Navegação */}
                <div className="flex justify-between items-center mb-4 px-6">
                  <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Flashcard {currentCardIndex + 1} de {selectedTopicFlashcards.length}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={prevCard}
                      disabled={currentCardIndex === 0}
                      className={`px-3 py-1 rounded ${
                        currentCardIndex === 0
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      Anterior
                    </button>
                    <button
                      onClick={nextCard}
                      disabled={currentCardIndex === selectedTopicFlashcards.length - 1}
                      className={`px-3 py-1 rounded ${
                        currentCardIndex === selectedTopicFlashcards.length - 1
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      Próximo
                    </button>
                  </div>
                </div>

                {/* Container do Flashcard com Flip 3D */}
                <div className="relative h-96 mx-6 mb-6" style={{ perspective: '1000px' }}>
                  <div 
                    className={`absolute inset-0 w-full h-full transition-transform duration-700 cursor-pointer`}
                    style={{
                      transformStyle: 'preserve-3d',
                      transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
                    }}
                    onClick={() => setIsFlipped(!isFlipped)}
                  >
                    {/* Frente do Flashcard */}
                    <div 
                      className={`absolute inset-0 w-full h-full rounded-xl shadow-xl flex flex-col justify-center items-center p-8 ${
                        darkMode ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white' : 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'
                      }`}
                      style={{ backfaceVisibility: 'hidden' }}
                    >
                      <div className="text-center">
                        <div className={`text-xs uppercase tracking-wide mb-4 font-semibold ${
                          darkMode ? 'text-blue-200' : 'text-blue-100'
                        }`}>
                          {selectedTopicFlashcards[currentCardIndex].materia}
                        </div>
                        <h3 className="text-2xl font-bold mb-6 leading-relaxed">
                          {selectedTopicFlashcards[currentCardIndex].pergunta}
                        </h3>
                        <div className={`text-sm opacity-75 ${darkMode ? 'text-blue-200' : 'text-blue-100'}`}>
                          Clique para ver a resposta
                        </div>
                      </div>
                    </div>

                    {/* Verso do Flashcard */}
                    <div 
                      className={`absolute inset-0 w-full h-full rounded-xl shadow-xl flex flex-col justify-center items-center p-8 ${
                        darkMode ? 'bg-gradient-to-br from-green-600 to-green-700 text-white' : 'bg-gradient-to-br from-green-500 to-green-600 text-white'
                      }`}
                      style={{ 
                        backfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)'
                      }}
                    >
                      <div className="text-center">
                        <div className={`text-xs uppercase tracking-wide mb-4 font-semibold ${
                          darkMode ? 'text-green-200' : 'text-green-100'
                        }`}>
                          Resposta
                        </div>
                        <p className="text-xl leading-relaxed">
                          {selectedTopicFlashcards[currentCardIndex].resposta}
                        </p>
                        <div className={`text-sm opacity-75 mt-6 ${darkMode ? 'text-green-200' : 'text-green-100'}`}>
                          Clique para voltar à pergunta
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Informações do Flashcard */}
                <div className="px-6 pb-6">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {selectedTopicFlashcards[currentCardIndex].topicoNumero} {selectedTopicFlashcards[currentCardIndex].topico}
                    </span>
                    <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Dificuldade: {selectedTopicFlashcards[currentCardIndex].dificuldade || 'médio'}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal Card Detail com Flip 3D */}
      {selectedCard && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4 px-6">
              <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Flashcard
              </h2>
              <button
                onClick={() => {
                  setSelectedCard(null)
                  setIsFlipped(false)
                }}
                className={`text-gray-500 hover:text-gray-700 ${darkMode ? 'text-gray-400 hover:text-gray-200' : ''}`}
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>
            
            {/* Container do Flashcard com Flip 3D */}
            <div className="relative h-96 mx-6 mb-6" style={{ perspective: '1000px' }}>
              <div 
                className={`absolute inset-0 w-full h-full transition-transform duration-700 cursor-pointer`}
                style={{
                  transformStyle: 'preserve-3d',
                  transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
                }}
                onClick={() => setIsFlipped(!isFlipped)}
              >
                {/* Frente do Flashcard */}
                <div 
                  className={`absolute inset-0 w-full h-full rounded-xl shadow-xl flex flex-col justify-center items-center p-8 ${
                    darkMode ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white' : 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'
                  }`}
                  style={{ backfaceVisibility: 'hidden' }}
                >
                  <div className="text-center">
                    <div className={`text-xs uppercase tracking-wide mb-4 font-semibold ${
                      darkMode ? 'text-blue-200' : 'text-blue-100'
                    }`}>
                      {selectedCard.materia}
                    </div>
                    <h3 className="text-2xl font-bold mb-6 leading-relaxed">
                      {selectedCard.pergunta}
                    </h3>
                    <div className={`text-sm opacity-75 ${darkMode ? 'text-blue-200' : 'text-blue-100'}`}>
                      Clique para ver a resposta
                    </div>
                  </div>
                </div>

                {/* Verso do Flashcard */}
                <div 
                  className={`absolute inset-0 w-full h-full rounded-xl shadow-xl flex flex-col justify-center items-center p-8 ${
                    darkMode ? 'bg-gradient-to-br from-green-600 to-green-700 text-white' : 'bg-gradient-to-br from-green-500 to-green-600 text-white'
                  }`}
                  style={{ 
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)'
                  }}
                >
                  <div className="text-center">
                    <div className={`text-xs uppercase tracking-wide mb-4 font-semibold ${
                      darkMode ? 'text-green-200' : 'text-green-100'
                    }`}>
                      Resposta
                    </div>
                    <p className="text-xl leading-relaxed">
                      {selectedCard.resposta}
                    </p>
                    <div className={`text-sm opacity-75 mt-6 ${darkMode ? 'text-green-200' : 'text-green-100'}`}>
                      Clique para voltar à pergunta
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Informações do Flashcard */}
            <div className="px-6 pb-6">
              <div className="flex items-center justify-between">
                <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {selectedCard.topicoNumero} {selectedCard.topico}
                </span>
                <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Revisões: {selectedCard.reviewCount || 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
