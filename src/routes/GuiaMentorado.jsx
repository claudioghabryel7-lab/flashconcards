import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, onSnapshot, getDoc, updateDoc, collection, getDocs, query, where, setDoc, serverTimestamp } from 'firebase/firestore'
import dayjs from 'dayjs'
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FireIcon,
  BookOpenIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  SparklesIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline'
import { callGeminiWithRetry, extractGeneratedText } from '../utils/geminiApi'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'

const GuiaMentorado = () => {
  const { user, profile } = useAuth()
  const { darkMode } = useDarkMode()
  const navigate = useNavigate()
  
  const [currentMonth, setCurrentMonth] = useState(dayjs())
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [courses, setCourses] = useState([])
  const [editalVerticalizado, setEditalVerticalizado] = useState(null)
  const [cronograma, setCronograma] = useState(null)
  const [config, setConfig] = useState({
    dataProva: null,
    hasTAF: false,
    tafExercicios: [],
    hasRedacao: false,
  })
  const [isAdmin, setIsAdmin] = useState(false)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  
  // Carregar cursos
  useEffect(() => {
    const loadCourses = async () => {
      try {
        const coursesRef = collection(db, 'courses')
        const coursesSnapshot = await getDocs(coursesRef)
        const coursesList = coursesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        setCourses(coursesList)
        
        // Selecionar curso do usuário ou o primeiro
        if (profile?.selectedCourseId) {
          setSelectedCourseId(profile.selectedCourseId)
        } else if (coursesList.length > 0) {
          setSelectedCourseId(coursesList[0].id)
        }
      } catch (error) {
        console.error('Erro ao carregar cursos:', error)
      }
    }
    
    loadCourses()
  }, [profile])
  
  // Carregar edital verticalizado
  useEffect(() => {
    if (!selectedCourseId) return
    
    const loadEdital = async () => {
      try {
        const editalRef = collection(db, 'courses', selectedCourseId, 'editalVerticalizado')
        const editalSnapshot = await getDocs(editalRef)
        
        if (!editalSnapshot.empty) {
          const editalData = editalSnapshot.docs[0].data()
          setEditalVerticalizado(editalData)
        }
      } catch (error) {
        console.error('Erro ao carregar edital verticalizado:', error)
      }
    }
    
    loadEdital()
  }, [selectedCourseId])
  
  // Carregar configuração do cronograma
  useEffect(() => {
    if (!selectedCourseId) return
    
    const loadConfig = async () => {
      try {
        const configRef = doc(db, 'courses', selectedCourseId, 'config', 'guiaMentorado')
        const configDoc = await getDoc(configRef)
        
        if (configDoc.exists()) {
          setConfig(configDoc.data())
        }
      } catch (error) {
        console.error('Erro ao carregar configuração:', error)
      }
    }
    
    loadConfig()
  }, [selectedCourseId])
  
  // Carregar cronograma do mês atual
  useEffect(() => {
    if (!selectedCourseId) return
    
    const monthKey = currentMonth.format('YYYY-MM')
    const cronogramaRef = doc(db, 'courses', selectedCourseId, 'cronograma', monthKey)
    
    const unsubscribe = onSnapshot(cronogramaRef, (doc) => {
      if (doc.exists()) {
        setCronograma(doc.data())
      } else {
        setCronograma(null)
      }
      setLoading(false)
    })
    
    return () => unsubscribe()
  }, [selectedCourseId, currentMonth])
  
  // Verificar se é admin
  useEffect(() => {
    setIsAdmin(profile?.role === 'admin')
  }, [profile])
  
  // Gerar dias do mês
  const getDaysInMonth = () => {
    const days = []
    const firstDay = currentMonth.startOf('month')
    const lastDay = currentMonth.endOf('month')
    
    // Adicionar dias vazios antes do primeiro dia
    const startDayOfWeek = firstDay.day()
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({ empty: true })
    }
    
    // Adicionar dias do mês
    for (let i = 1; i <= lastDay.date(); i++) {
      const date = currentMonth.date(i)
      const dayKey = date.format('YYYY-MM-DD')
      const dayData = cronograma?.days?.[dayKey] || null
      
      days.push({
        date: date,
        dayKey: dayKey,
        data: dayData,
        isToday: date.isSame(dayjs(), 'day'),
        isPast: date.isBefore(dayjs(), 'day'),
      })
    }
    
    return days
  }
  
  // Navegação do calendário
  const previousMonth = () => {
    setCurrentMonth(currentMonth.subtract(1, 'month'))
  }
  
  const nextMonth = () => {
    setCurrentMonth(currentMonth.add(1, 'month'))
  }
  
  // Salvar configuração
  const saveConfig = async (newConfig) => {
    try {
      const configRef = doc(db, 'courses', selectedCourseId, 'config', 'guiaMentorado')
      await setDoc(configRef, {
        ...newConfig,
        updatedAt: serverTimestamp(),
      })
      setConfig(newConfig)
      setShowConfigModal(false)
    } catch (error) {
      console.error('Erro ao salvar configuração:', error)
    }
  }
  
  // Gerar cronograma estratégico com IA
  const generateCronograma = async () => {
    if (!config.dataProva || !editalVerticalizado) {
      alert('Configure a data da prova e tenha um edital verticalizado.')
      return
    }
    
    setLoading(true)
    
    try {
      const provaDate = dayjs(config.dataProva)
      const today = dayjs()
      const daysUntilProva = provaDate.diff(today, 'day')
      
      if (daysUntilProva <= 0) {
        alert('A data da prova deve ser no futuro.')
        setLoading(false)
        return
      }
      
      setMessage('🤖 Gerando cronograma estratégico com IA...')
      
      // Preparar dados do edital para a IA
      const disciplinas = editalVerticalizado.disciplinas || []
      const editalSummary = disciplinas.map(d => ({
        nome: d.nome,
        topicos: d.topicos?.map(t => ({
          numero: t.numero,
          nome: t.nome
        })) || []
      }))
      
      // Prompt para a IA gerar cronograma estratégico
      const prompt = `DATA ATUAL: ${today.format('DD/MM/YYYY')}
DATA DA PROVA: ${provaDate.format('DD/MM/YYYY')}
DIAS ATÉ A PROVA: ${daysUntilProva}
TEM TAF: ${config.hasTAF ? 'Sim' : 'Não'}
TEM REDAÇÃO: ${config.hasRedacao ? 'Sim' : 'Não'}
EXERCÍCIOS TAF: ${config.tafExercicios?.join(', ') || 'Nenhum'}

EDITAL VERTICALIZADO COMPLETO:
${JSON.stringify(editalSummary, null, 2)}

ANÁLISE OBRIGATÓRIA DO EDITAL:
- Você DEVE ler TODAS as matérias listadas acima
- Você DEVE ler TODOS os tópicos de cada matéria
- Conte quantas matérias existem no total
- Conte quantos tópicos existem no total
- Calcule quantos tópicos precisa estudar por dia para cobrir TUDO até a prova
- NÃO pule nenhuma matéria ou tópico

INSTRUÇÕES:
Você é um MENTOR DE ESTUDOS especialista em concursos. Crie um cronograma estratégico do dia atual até o dia da prova.

REGRAS OBRIGATÓRIAS DO MENTOR:
1. TODAS as matérias do edital devem ser contempladas - NÃO PULE NENHUMA MATÉRIA OU TÓPICO
2. TODOS os tópicos de cada matéria devem ser estudados pelo menos uma vez
3. AGRUPE matérias AFINS no mesmo dia (ex: Direito Constitucional + Administrativo + Penal juntos)
4. NÃO misture matérias muito diferentes (ex: NÃO coloque Português + Biologia + Lei X no mesmo dia)
5. Use 3-4 matérias por dia se necessário para acelerar e fechar o edital completo
6. Dias de TAF devem ter estudo também (manhã: TAF, tarde/noite: estudo)
7. Sem dia de descanso (simulado serve como descanso)
8. Reta final: últimos 7 dias apenas revisão/simulado
9. Distribua as matérias de forma ESTRATÉGICA e equilibrada (não sequencial)
10. Priorize matérias mais importantes com mais tempo de estudo
11. OBJETIVO: Fechar TODO o edital 7 dias antes da prova

ESTRATÉGIA DE AGRUPAMENTO INTELIGENTE:
- Agrupe matérias da mesma área: jurídicas (Constitucional, Administrativo, Penal, Civil, Trabalho)
- Agrupe matérias de exatas: Raciocínio Lógico, Matemática, Informática
- Agrupe matérias de humanas: Português, História, Geografia
- Agrupe matérias específicas: Direito Penal Militar, Direito Processual Penal Militar, Estatuto do Policial
- Exemplo de dia inteligente: Constitucional + Administrativo + Penal (todas jurídicas)
- Exemplo de dia ruim: Português + Biologia + Lei X (muito diferentes)

ESTRATÉGIA DE DISTRIBUIÇÃO:
- Divida as matérias em grupos por área de conhecimento
- Intercale grupos diferentes em dias alternados
- Use 3-4 matérias por dia para acelerar o progresso
- Crie blocos de estudo focados em áreas específicas
- Varie os tipos de estudo (teoria, prática, revisão)

RETORNE APENAS ESTE JSON (sem texto adicional):
{
  "cronograma": [
    {
      "data": "YYYY-MM-DD",
      "tipo": "estudo",
      "fase": "fundamentacao",
      "materias": [{"disciplina": "nome", "topico": "nome"}],
      "taf_exercicio": "",
      "descricao": ""
    }
  ]
}

CRÍTICO - NÃO CORTAR O JSON:
- O JSON deve ser COMPLETO e VÁLIDO
- NÃO pare no meio do array cronograma
- Certifique-se de fechar todas as chaves e colchetes
- Se o JSON for muito longo, simplifique as descrições mas NÃO corte a estrutura
- Verifique se o array cronograma está completo antes de finalizar

IMPORTANTE:
- Comece em ${today.format('DD/MM/YYYY')}
- Termine em ${provaDate.format('DD/MM/YYYY')}
- JSON deve ser válido e completo
- Use aspas duplas
- Não adicione comentários no JSON
- NÃO corte o JSON no meio - verifique se está completo antes de enviar`

      console.log('📝 Enviando prompt para IA...')
      
      // Aumentar limite de tokens para cronogramas longos (até 65536 tokens)
      const response = await callGeminiWithRetry(prompt, {
        models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 65536 // Aumentado para evitar corte em cronogramas longos
        }
      })
      const generatedText = extractGeneratedText(response)
      
      console.log('📝 Resposta da IA:', generatedText)
      
      // Extrair JSON da resposta com tratamento de erro melhorado
      let jsonMatch = generatedText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        // Tentar encontrar JSON entre blocos de código markdown
        jsonMatch = generatedText.match(/```json\s*([\s\S]*?)\s*```/)
        if (jsonMatch) {
          jsonMatch = [jsonMatch[1]]
        }
      }
      
      if (!jsonMatch) {
        throw new Error('Não foi possível extrair JSON da resposta da IA. A resposta não contém um JSON válido.')
      }
      
      let jsonText = jsonMatch[0]
      
      // Tentar completar JSON se estiver cortado (problema comum com respostas longas)
      let cronogramaIA
      try {
        cronogramaIA = JSON.parse(jsonText)
      } catch (parseError) {
        console.error('Erro ao fazer parse do JSON:', parseError)
        console.error('JSON que falhou:', jsonText.substring(0, 500))
        
        // Tentar completar JSON cortado
        try {
          // Contar chaves para tentar fechar corretamente
          const openBraces = (jsonText.match(/\{/g) || []).length
          const closeBraces = (jsonText.match(/\}/g) || []).length
          const openBrackets = (jsonText.match(/\[/g) || []).length
          const closeBrackets = (jsonText.match(/\]/g) || []).length
          
          let completedJson = jsonText
          
          // Adicionar chaves/colchetes faltantes
          for (let i = 0; i < openBraces - closeBraces; i++) {
            completedJson += '}'
          }
          for (let i = 0; i < openBrackets - closeBrackets; i++) {
            completedJson += ']'
          }
          
          // Remover vírgula no final se houver
          completedJson = completedJson.replace(/,\s*}/g, '}')
          completedJson = completedJson.replace(/,\s*]/g, ']')
          
          cronogramaIA = JSON.parse(completedJson)
          console.log('JSON completado com sucesso')
        } catch (completeError) {
          console.error('Erro ao completar JSON:', completeError)
          
          // Tentar limpar o JSON e fazer parse novamente
          try {
            const cleanedJson = jsonText
              .replace(/[\n\r]/g, '')
              .replace(/\s+/g, ' ')
              .replace(/,\s*}/g, '}')
              .replace(/,\s*]/g, ']')
            cronogramaIA = JSON.parse(cleanedJson)
            console.log('JSON limpo com sucesso')
          } catch (cleanError) {
            console.error('Erro ao fazer parse do JSON limpo:', cleanError)
            throw new Error('Erro ao fazer parse do JSON gerado pela IA. O JSON está malformado ou incompleto. Tente gerar novamente.')
          }
        }
      }
      
      if (!cronogramaIA.cronograma || !Array.isArray(cronogramaIA.cronograma)) {
        throw new Error('Estrutura de JSON inválida: não contém array "cronograma"')
      }
      
      // Validar estrutura de cada dia
      cronogramaIA.cronograma.forEach((dia, idx) => {
        if (!dia.data || !dia.tipo) {
          throw new Error(`Dia ${idx} inválido: falta "data" ou "tipo"`)
        }
        if (!Array.isArray(dia.materias)) {
          dia.materias = []
        }
      })
      
      setMessage('💾 Salvando cronograma...')
      
      // Salvar cronograma por mês (cada mês tem seu próprio documento)
      const monthsToSave = new Set()
      
      cronogramaIA.cronograma.forEach((dia) => {
        const dayKey = dia.data
        const dayDate = dayjs(dayKey)
        const monthKey = dayDate.format('YYYY-MM')
        monthsToSave.add(monthKey)
      })
      
      // Salvar cada mês separadamente
      for (const monthKey of monthsToSave) {
        const cronogramaData = {
          month: monthKey,
          generatedAt: serverTimestamp(),
          config: config,
          generatedBy: 'ai',
          days: {},
        }
        
        // Filtrar dias deste mês
        cronogramaIA.cronograma.forEach((dia) => {
          const dayKey = dia.data
          const dayDate = dayjs(dayKey)
          
          if (dayDate.format('YYYY-MM') === monthKey) {
            cronogramaData.days[dayKey] = {
              type: dia.tipo,
              fase: dia.fase,
              materias: dia.materias || [],
              tafExercicio: dia.taf_exercicio || '',
              descricao: dia.descricao || '',
              completed: false,
            }
          }
        })
        
        // Salvar este mês
        const cronogramaRef = doc(db, 'courses', selectedCourseId, 'cronograma', monthKey)
        await setDoc(cronogramaRef, cronogramaData)
      }
      
      // Atualizar visualização para o mês atual
      const currentMonthKey = currentMonth.format('YYYY-MM')
      const currentMonthRef = doc(db, 'courses', selectedCourseId, 'cronograma', currentMonthKey)
      const currentMonthDoc = await getDoc(currentMonthRef)
      
      if (currentMonthDoc.exists()) {
        setCronograma(currentMonthDoc.data())
      }
      
      setMessage(`✅ Cronograma gerado com sucesso! ${monthsToSave.size} meses planejados.`)
      
      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      console.error('Erro ao gerar cronograma:', error)
      alert('Erro ao gerar cronograma: ' + error.message)
      setMessage('')
    } finally {
      setLoading(false)
    }
  }
  
  // Marcar dia como completo
  const toggleDayComplete = async (dayKey) => {
    if (!cronograma) return
    
    try {
      const updatedDays = { ...cronograma.days }
      updatedDays[dayKey] = {
        ...updatedDays[dayKey],
        completed: !updatedDays[dayKey].completed,
      }
      
      const cronogramaRef = doc(db, 'courses', selectedCourseId, 'cronograma', currentMonth.format('YYYY-MM'))
      await updateDoc(cronogramaRef, {
        days: updatedDays,
      })
    } catch (error) {
      console.error('Erro ao atualizar dia:', error)
    }
  }
  
  const days = getDaysInMonth()
  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  
  return (
    <div className="min-h-screen bg-background-primary text-text-primary">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-text-muted hover:text-text-primary mb-4 transition-colors"
          >
            <ChevronLeftIcon className="h-5 w-5" />
            Voltar ao Dashboard
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">
                📅 Guia Mentorado
              </h1>
              <p className="text-text-secondary mt-1">
                Cronograma estratégico baseado no edital verticalizado
              </p>
            </div>
            
            {isAdmin && (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowConfigModal(true)}
                  className="px-4 py-2 bg-accent-cyan text-background-primary rounded-lg hover:bg-accent-cyan-dim transition-colors flex items-center gap-2"
                >
                  <PencilIcon className="h-4 w-4" />
                  Configurar
                </button>
                <button
                  onClick={generateCronograma}
                  disabled={loading || !config.dataProva || !editalVerticalizado}
                  className="px-4 py-2 bg-gradient-to-r from-accent-orange to-accent-cyan text-background-primary rounded-lg hover:from-accent-orange-dim hover:to-accent-cyan-dim transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <SparklesIcon className="h-4 w-4" />
                  Gerar Cronograma
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* Mensagem de Progresso */}
        {message && (
          <div className="mb-6 p-4 rounded-xl bg-accent-cyan/10 border border-accent-cyan/30 text-accent-cyan text-center">
            {message}
          </div>
        )}
        
        {/* Seleção de Curso */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-text-secondary mb-2">
            Curso
          </label>
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            className="w-full sm:w-64 rounded-xl border border-border-primary bg-background-card px-4 py-2 text-text-primary focus:border-accent-cyan focus:outline-none"
          >
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        </div>
        
        {/* Informações da Prova */}
        {config.dataProva && (
          <div className="mb-6 p-4 rounded-xl bg-background-card border border-border-primary">
            <div className="flex items-center gap-2 mb-2">
              <CalendarIcon className="h-5 w-5 text-accent-orange" />
              <span className="font-semibold text-text-primary">Data da Prova</span>
            </div>
            <p className="text-text-secondary">
              {dayjs(config.dataProva).format('DD/MM/YYYY')}
              {dayjs(config.dataProva).isAfter(dayjs()) && (
                <span className="ml-2 text-accent-cyan">
                  ({dayjs(config.dataProva).diff(dayjs(), 'day')} dias restantes)
                </span>
              )}
            </p>
          </div>
        )}
        
        {/* Calendário */}
        <div className="bg-background-card rounded-xl border border-border-primary overflow-hidden">
          {/* Navegação do Mês */}
          <div className="flex items-center justify-between p-4 border-b border-border-primary">
            <button
              onClick={previousMonth}
              className="p-2 rounded-lg hover:bg-background-card-hover transition-colors"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            
            <h2 className="text-xl font-bold text-text-primary">
              {currentMonth.format('MMMM YYYY')}
            </h2>
            
            <button
              onClick={nextMonth}
              className="p-2 rounded-lg hover:bg-background-card-hover transition-colors"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>
          
          {/* Dias da Semana */}
          <div className="grid grid-cols-7 border-b border-border-primary">
            {weekDays.map((day) => (
              <div
                key={day}
                className="p-2 sm:p-3 text-center text-xs sm:text-sm font-semibold text-text-secondary"
              >
                {day}
              </div>
            ))}
          </div>
          
          {/* Dias do Mês */}
          <div className="grid grid-cols-7">
            {days.map((day, index) => (
              <div
                key={index}
                className={`min-h-[60px] sm:min-h-[80px] p-1 sm:p-2 border-r border-b border-border-primary ${
                  day.empty ? 'bg-background-card-hover' : 'bg-background-card'
                } ${day.isToday ? 'ring-2 ring-accent-cyan' : ''}`}
              >
                {day.empty ? (
                  <div className="h-full"></div>
                ) : (
                  <div className="h-full flex flex-col">
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-xs sm:text-sm font-semibold ${
                          day.isToday
                            ? 'text-accent-cyan'
                            : day.isPast
                            ? 'text-text-muted'
                            : 'text-text-primary'
                        }`}
                      >
                        {day.date.date()}
                      </span>
                      {day.data?.completed && (
                        <CheckIcon className="h-3 w-3 text-green-500" />
                      )}
                    </div>
                    
                    {day.data && (
                      <div
                        onClick={() => day.data && navigate(`/guia-mentorado/${selectedCourseId}/${day.dayKey}`)}
                        className={`flex-1 rounded-lg p-1 sm:p-2 text-xs cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center ${
                          day.data.type === 'estudo'
                            ? 'bg-blue-500/10 border border-blue-500/30'
                            : day.data.type === 'taf'
                            ? 'bg-orange-500/10 border border-orange-500/30'
                            : day.data.type === 'redacao'
                            ? 'bg-pink-500/10 border border-pink-500/30'
                            : day.data.type === 'revisao'
                            ? 'bg-green-500/10 border border-green-500/30'
                            : day.data.type === 'simulado'
                            ? 'bg-purple-500/10 border border-purple-500/30'
                            : day.data.type === 'reta_final'
                            ? 'bg-red-500/10 border border-red-500/30'
                            : 'bg-purple-500/10 border border-purple-500/30'
                        }`}
                      >
                        {day.data.type === 'estudo' && (
                          <BookOpenIcon className="h-4 w-4 text-blue-400" />
                        )}
                        
                        {day.data.type === 'taf' && (
                          <DocumentTextIcon className="h-4 w-4 text-orange-400" />
                        )}
                        
                        {day.data.type === 'redacao' && (
                          <PencilIcon className="h-4 w-4 text-pink-400" />
                        )}
                        
                        {day.data.type === 'revisao' && (
                          <SparklesIcon className="h-4 w-4 text-green-400" />
                        )}
                        
                        {day.data.type === 'simulado' && (
                          <FireIcon className="h-4 w-4 text-purple-400" />
                        )}
                        
                        {day.data.type === 'reta_final' && (
                          <FireIcon className="h-4 w-4 text-red-400" />
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        
        {/* Modal de Configuração */}
        {showConfigModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-background-card rounded-xl p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-text-primary">
                  Configurar Guia Mentorado
                </h3>
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="text-text-muted hover:text-text-primary"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-text-secondary mb-2">
                    Data da Prova *
                  </label>
                  <input
                    type="date"
                    value={config.dataProva || ''}
                    onChange={(e) => setConfig({ ...config, dataProva: e.target.value })}
                    className="w-full rounded-lg border border-border-primary bg-background-card-hover px-4 py-2 text-text-primary focus:border-accent-cyan focus:outline-none"
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="hasTAF"
                    checked={config.hasTAF}
                    onChange={(e) => setConfig({ ...config, hasTAF: e.target.checked })}
                    className="rounded"
                  />
                  <label htmlFor="hasTAF" className="text-sm text-text-primary">
                    Possui TAF (Teste de Aptidão Física)
                  </label>
                </div>
                
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="hasRedacao"
                    checked={config.hasRedacao}
                    onChange={(e) => setConfig({ ...config, hasRedacao: e.target.checked })}
                    className="rounded"
                  />
                  <label htmlFor="hasRedacao" className="text-sm text-text-primary">
                    Possui Redação
                  </label>
                </div>
                
                {config.hasTAF && (
                  <div>
                    <label className="block text-sm font-semibold text-text-secondary mb-2">
                      Exercícios do TAF
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {['Barra', 'Flexão', 'Corrida', 'Abdominal', 'Shut Run', 'Salto'].map((exercicio) => (
                        <label key={exercicio} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={config.tafExercicios?.includes(exercicio)}
                            onChange={(e) => {
                              const updated = e.target.checked
                                ? [...(config.tafExercicios || []), exercicio]
                                : config.tafExercicios?.filter((ex) => ex !== exercicio) || []
                              setConfig({ ...config, tafExercicios: updated })
                            }}
                            className="rounded"
                          />
                          <span className="text-sm text-text-primary">{exercicio}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="flex-1 px-4 py-2 text-text-primary bg-background-card-hover rounded-lg font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => saveConfig(config)}
                  className="flex-1 px-4 py-2 bg-accent-cyan text-background-primary rounded-lg font-medium hover:bg-accent-cyan-dim transition-colors"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default GuiaMentorado
