import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, onSnapshot, getDoc, collection, getDocs, setDoc, serverTimestamp } from 'firebase/firestore'
import dayjs from 'dayjs'
import {
  CalendarIcon,
  PencilIcon,
  XMarkIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { callGeminiWithRetry, extractGeneratedText, generateAiJson, formatAiErrorForUser } from '../utils/geminiApi'
import { loadEditalVerticalizado } from '../utils/editalVerticalizadoLoader'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { CPPageHeader } from '@/components/cp/CPPageLayout'
import { hasPurchasedCourse } from '../utils/courseAccess'
import MentoradoCalendar from '../components/guiaMentorado/MentoradoCalendar'
import { DEFAULT_PLANNING_DAYS } from '../constants/guiaMentorado'
import {
  isUsingDefaultPlanningWindow,
  resolvePlanningEndDate,
  startMentoradoContentAutomation,
} from '../services/guiaMentoradoAutomationService'

const GuiaMentorado = () => {
  const { profile, user } = useAuth()
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
    autoGerarConteudo: false,
  })
  const [isAdmin, setIsAdmin] = useState(false)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [calendarLoading, setCalendarLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState('')
  
  // Carregar cursos (apenas relevantes para o usuário)
  useEffect(() => {
    const loadCourses = async () => {
      try {
        const coursesRef = collection(db, 'courses')
        const coursesSnapshot = await getDocs(coursesRef)
        const coursesList = coursesSnapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((c) => c.active !== false)

        const isAdminUser = profile?.role === 'admin'
        const visible = isAdminUser
          ? coursesList
          : coursesList.filter(
              (c) =>
                c.id === 'alego-default' ||
                hasPurchasedCourse(profile, c.id) ||
                c.id === profile?.selectedCourseId
            )

        setCourses(visible)

        if (profile?.selectedCourseId && visible.some((c) => c.id === profile.selectedCourseId)) {
          setSelectedCourseId(profile.selectedCourseId)
        } else if (visible.length > 0) {
          setSelectedCourseId(visible[0].id)
        }
      } catch (error) {
        console.error('Erro ao carregar cursos:', error)
      }
    }

    if (profile) loadCourses()
  }, [profile])
  
  // Carregar edital verticalizado
  useEffect(() => {
    if (!selectedCourseId) return

    let cancelled = false
    loadEditalVerticalizado(selectedCourseId)
      .then((data) => {
        if (!cancelled) setEditalVerticalizado(data)
      })
      .catch((error) => {
        console.error('Erro ao carregar edital verticalizado:', error)
      })

    return () => {
      cancelled = true
    }
  }, [selectedCourseId])
  
  // Carregar configuração do cronograma
  useEffect(() => {
    if (!selectedCourseId) return
    
    const loadConfig = async () => {
      try {
        const configRef = doc(db, 'courses', selectedCourseId, 'config', 'guiaMentorado')
        const configDoc = await getDoc(configRef)
        
        if (configDoc.exists()) {
          const data = configDoc.data()
          setConfig({
            dataProva: data.dataProva || null,
            hasTAF: Boolean(data.hasTAF),
            tafExercicios: data.tafExercicios || [],
            hasRedacao: Boolean(data.hasRedacao),
            autoGerarConteudo: Boolean(data.autoGerarConteudo),
          })
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

    setCalendarLoading(true)
    const monthKey = currentMonth.format('YYYY-MM')
    const cronogramaRef = doc(db, 'courses', selectedCourseId, 'cronograma', monthKey)

    const unsubscribe = onSnapshot(
      cronogramaRef,
      (snapshot) => {
        setCronograma(snapshot.exists() ? snapshot.data() : null)
        setCalendarLoading(false)
      },
      () => setCalendarLoading(false)
    )

    return () => unsubscribe()
  }, [selectedCourseId, currentMonth])
  
  // Verificar se é admin
  useEffect(() => {
    setIsAdmin(profile?.role === 'admin')
  }, [profile])
  
  const previousMonth = useCallback(() => {
    setCurrentMonth((m) => m.subtract(1, 'month'))
  }, [])

  const nextMonth = useCallback(() => {
    setCurrentMonth((m) => m.add(1, 'month'))
  }, [])

  const goToToday = useCallback(() => {
    setCurrentMonth(dayjs())
  }, [])

  const handleDayClick = useCallback(
    (dayKey) => {
      navigate(`/guia-mentorado/${selectedCourseId}/${dayKey}`)
    },
    [navigate, selectedCourseId]
  )
  
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
    if (!editalVerticalizado) {
      alert('É necessário ter um edital verticalizado para gerar o cronograma.')
      return
    }

    const planningEnd = resolvePlanningEndDate(config)
    const today = dayjs().startOf('day')
    const daysUntilProva = planningEnd.diff(today, 'day')

    if (daysUntilProva <= 0) {
      alert('O período de planejamento deve ser no futuro.')
      return
    }

    const usingDefaultWindow = isUsingDefaultPlanningWindow(config)
    
    setGenerating(true)
    
    try {
      setMessage(
        usingDefaultWindow
          ? `🤖 Gerando cronograma para ${DEFAULT_PLANNING_DAYS} dias (sem data da prova definida)…`
          : '🤖 Gerando cronograma estratégico com IA…',
      )
      
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
DATA FINAL DO PLANEJAMENTO: ${planningEnd.format('DD/MM/YYYY')}
${config.dataProva && !usingDefaultWindow ? `DATA DA PROVA: ${dayjs(config.dataProva).format('DD/MM/YYYY')}` : `MODO SEM DATA DA PROVA: planeje exatamente ${DEFAULT_PLANNING_DAYS} dias de estudo a partir de hoje`}
DIAS DE PLANEJAMENTO: ${daysUntilProva}
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
- Termine em ${planningEnd.format('DD/MM/YYYY')}
- JSON deve ser válido e completo
- Use aspas duplas
- Não adicione comentários no JSON
- NÃO corte o JSON no meio - verifique se está completo antes de enviar`

      console.log('📝 Enviando prompt para IA...')
      
      // Aumentar limite de tokens para cronogramas longos (até 65536 tokens)
      const response = await callGeminiWithRetry(prompt, {
        courseId: selectedCourseId || 'alego-default',
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 65536,
        },
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

      if (config.autoGerarConteudo) {
        if (!user?.uid) {
          setMessage(
            '✅ Cronograma salvo. Faça login como admin para disparar a geração automática de conteúdos.',
          )
        } else {
          setMessage('🚀 Cronograma salvo. Iniciando geração automática de flashcards, material e questões…')
          try {
            const { topicCount } = await startMentoradoContentAutomation({
              userId: user.uid,
              courseId: selectedCourseId,
              cronogramaEntries: cronogramaIA.cronograma,
              editalVerticalizado,
              autoPublish: true,
            })
            setMessage(
              `✅ Cronograma pronto! Automação iniciada para ${topicCount} tópico(s). Acompanhe o banner de geração.`,
            )
          } catch (autoErr) {
            console.error('Erro na automação do Guia Mentorado:', autoErr)
            setMessage(
              `✅ Cronograma salvo, mas a automação falhou: ${autoErr.message || 'erro desconhecido'}`,
            )
          }
        }
      }
      
      setTimeout(() => setMessage(''), 8000)
    } catch (error) {
      console.error('Erro ao gerar cronograma:', error)
      alert('Erro ao gerar cronograma: ' + error.message)
      setMessage('')
    } finally {
      setGenerating(false)
    }
  }
  
  return (
    <div className="space-y-6">
      <CPPageHeader
        badge="Cronograma"
        title="Guia Mentorado"
        subtitle="Cronograma estratégico baseado no edital verticalizado"
        backHref="/dashboard"
        actions={
          isAdmin ? (
            <>
              <button
                onClick={() => setShowConfigModal(true)}
                className="cp-btn-ghost !text-sm"
              >
                <PencilIcon className="h-4 w-4" />
                Configurar
              </button>
              <button
                onClick={generateCronograma}
                disabled={generating || !editalVerticalizado}
                className="cp-btn-primary !text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <SparklesIcon className="h-4 w-4" />
                {generating ? 'Gerando...' : 'Gerar Cronograma'}
              </button>
            </>
          ) : undefined
        }
      />

      {message && (
        <div className="rounded-xl border border-[var(--cp-accent-2)]/30 bg-[var(--cp-accent-2)]/10 px-4 py-3 text-center text-sm text-[var(--cp-accent-2)]">
          {message}
        </div>
      )}

      <div>
        <label className="mb-2 block font-mono text-xs uppercase tracking-wide text-cp-muted">
          Curso
        </label>
        <select
          value={selectedCourseId}
          onChange={(e) => setSelectedCourseId(e.target.value)}
          className="w-full rounded-xl border border-cp-border bg-cp-surface px-4 py-2.5 text-cp-text focus:border-[var(--cp-accent)] focus:outline-none sm:w-72"
        >
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}
            </option>
          ))}
        </select>
      </div>

      {config.dataProva ? (
        <div className="cp-card flex items-center gap-4 !rounded-2xl p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cp-border bg-cp-surface">
            <CalendarIcon className="h-5 w-5 text-[var(--cp-accent-4)]" />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-cp-muted">Data da prova</p>
            <p className="text-cp-text">
              {dayjs(config.dataProva).format('DD/MM/YYYY')}
              {dayjs(config.dataProva).isAfter(dayjs()) && (
                <span className="ml-2 text-[var(--cp-accent-2)]">
                  ({dayjs(config.dataProva).diff(dayjs(), 'day')} dias restantes)
                </span>
              )}
            </p>
          </div>
        </div>
      ) : (
        <div className="cp-card flex items-center gap-4 !rounded-2xl border-dashed p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cp-border bg-cp-surface">
            <CalendarIcon className="h-5 w-5 text-cp-muted" />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-cp-muted">Planejamento padrão</p>
            <p className="text-sm text-cp-text">
              Sem data da prova — o cronograma usará <strong>{DEFAULT_PLANNING_DAYS} dias</strong> a partir de hoje.
            </p>
          </div>
        </div>
      )}

      {isAdmin && config.autoGerarConteudo && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          Automação ativa: ao gerar o cronograma, o sistema cria e libera flashcards, material (Estudar) e questões
          de cada tópico automaticamente no servidor.
        </div>
      )}

      <MentoradoCalendar
        currentMonth={currentMonth}
        cronograma={cronograma}
        examDate={config.dataProva || resolvePlanningEndDate(config).format('YYYY-MM-DD')}
        loading={calendarLoading}
        onPreviousMonth={previousMonth}
        onNextMonth={nextMonth}
        onGoToday={goToToday}
        onDayClick={handleDayClick}
      />
        
        {showConfigModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="cp-card w-full max-w-md !rounded-2xl p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="cp-headline text-lg text-cp-text">Configurar Guia Mentorado</h3>
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="text-cp-muted transition hover:text-cp-text"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-cp-muted">
                    Data da Prova (opcional)
                  </label>
                  <input
                    type="date"
                    value={config.dataProva || ''}
                    onChange={(e) => setConfig({ ...config, dataProva: e.target.value || null })}
                    className="w-full rounded-lg border border-cp-border bg-cp-surface px-4 py-2 text-cp-text focus:border-[var(--cp-accent)] focus:outline-none"
                  />
                  <p className="mt-1 text-xs text-cp-muted">
                    Se vazio, o cronograma usa {DEFAULT_PLANNING_DAYS} dias a partir de hoje.
                  </p>
                </div>

                <div className="rounded-xl border border-cp-border bg-cp-surface/60 p-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={Boolean(config.autoGerarConteudo)}
                      onChange={(e) =>
                        setConfig({ ...config, autoGerarConteudo: e.target.checked })
                      }
                      className="mt-1 rounded"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-cp-text">
                        Gerar e liberar conteúdos automaticamente
                      </span>
                      <span className="mt-1 block text-xs text-cp-muted">
                        Para cada tópico do cronograma, gera flashcards, material de estudo e questões (nível 1)
                        e publica como disponível — sem clicar tópico por tópico no admin.
                      </span>
                    </span>
                  </label>
                </div>
                
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="hasTAF"
                    checked={config.hasTAF}
                    onChange={(e) => setConfig({ ...config, hasTAF: e.target.checked })}
                    className="rounded"
                  />
                  <label htmlFor="hasTAF" className="text-sm text-cp-text">
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
                  <label htmlFor="hasRedacao" className="text-sm text-cp-text">
                    Possui Redação
                  </label>
                </div>
                
                {config.hasTAF && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-cp-muted">
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
                          <span className="text-sm text-cp-text">{exercicio}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="cp-btn-ghost flex-1 !text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => saveConfig(config)}
                  className="cp-btn-primary flex-1 !text-sm"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  )
}

export default GuiaMentorado
