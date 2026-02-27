import { useState, useEffect, useMemo, useRef } from 'react'
import { doc, getDoc, setDoc, collection, getDocs, query, where, orderBy } from 'firebase/firestore'
import { db } from '../firebase/config'
import dayjs from 'dayjs'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const useStudyPlanner = (userId, courseId, editalVerticalizado) => {
  const [dailyRecommendation, setDailyRecommendation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [completedTopics, setCompletedTopics] = useState(new Set())
  const [error, setError] = useState(null)
  const [shouldUpdate, setShouldUpdate] = useState(false)
  const hasInitialized = useRef(false)
  const lastEditalRef = useRef(null)

  // Calcular dias restantes (60 dias a partir de hoje - 2 meses)
  const targetDate = useMemo(() => {
    return dayjs().add(60, 'days').format('YYYY-MM-DD')
  }, [])

  const daysRemaining = useMemo(() => {
    const today = dayjs()
    const target = dayjs().add(60, 'days')
    return Math.max(0, target.diff(today, 'day'))
  }, [])

  // Carregar tópicos já completos do usuário
  const loadCompletedTopics = async () => {
    if (!userId || !courseId) return

    try {
      const completedSet = new Set()
      
      // Buscar todos os registros de progresso do usuário para este curso
      // Removido orderBy para evitar necessidade de índice composto
      const progressQuery = query(
        collection(db, 'editalProgress'),
        where('userId', '==', userId),
        where('courseId', '==', courseId)
      )

      const progressSnapshot = await getDocs(progressQuery)
      progressSnapshot.forEach((doc) => {
        const data = doc.data()
        if (data.disciplina && data.topico) {
          const key = `${data.disciplina}::${data.topico}`
          completedSet.add(key)
        }
      })

      setCompletedTopics(completedSet)
      return completedSet
    } catch (error) {
      console.error('Erro ao carregar tópicos completos:', error)
      return new Set()
    }
  }

  // Verificar recomendação salva no Firestore (sincronizado entre dispositivos)
  const getCachedRecommendation = async () => {
    if (!userId || !courseId) return null
    
    try {
      const today = dayjs().format('YYYY-MM-DD')
      const recommendationRef = doc(db, 'studyPlannerRecommendations', `${userId}_${courseId}_${today}`)
      const recommendationDoc = await getDoc(recommendationRef)
      
      if (recommendationDoc.exists()) {
        const data = recommendationDoc.data()
        // Verificar se é do dia de hoje
        if (data.date === today && data.recommendation) {
          return data.recommendation
        }
      }
    } catch (error) {
      console.error('Erro ao ler recomendação do Firestore:', error)
    }
    return null
  }

  // Salvar recomendação no Firestore (sincronizado entre dispositivos)
  const saveCachedRecommendation = async (recommendation) => {
    if (!userId || !courseId) return
    
    try {
      const today = dayjs().format('YYYY-MM-DD')
      const recommendationRef = doc(db, 'studyPlannerRecommendations', `${userId}_${courseId}_${today}`)
      await setDoc(recommendationRef, {
        userId,
        courseId,
        date: today,
        recommendation,
        createdAt: new Date(),
        updatedAt: new Date()
      }, { merge: true })
    } catch (error) {
      console.error('Erro ao salvar recomendação no Firestore:', error)
    }
  }

  // Gerar recomendação diária com IA
  const generateDailyRecommendation = async (force = false) => {
    if (!userId || !courseId || !editalVerticalizado) {
      setLoading(false)
      return
    }

    // Verificar cache no Firestore primeiro (a menos que seja forçado)
    if (!force) {
      const cached = await getCachedRecommendation()
      if (cached) {
        setDailyRecommendation(cached)
        setLoading(false)
        return
      }
    }

    setLoading(true)
    setError(null)

    try {
      // Carregar tópicos completos
      const completed = await loadCompletedTopics()

      // Preparar estrutura do edital para a IA
      const editalStructure = editalVerticalizado.disciplinas?.map(disciplina => ({
        nome: disciplina.nome,
        totalTopicos: disciplina.topicos?.length || 0,
        topicos: disciplina.topicos?.map(topico => ({
          numero: topico.numero || '',
          nome: topico.nome || '',
          nivel: topico.nivel || 0,
          completado: completed.has(`${disciplina.nome}::${topico.nome || topico.numero}`)
        })) || []
      })) || []

      // Calcular estatísticas
      const totalDisciplinas = editalStructure.length
      const totalTopicos = editalStructure.reduce((sum, d) => sum + d.totalTopicos, 0)
      const topicosCompletos = Array.from(completed).length
      const topicosRestantes = totalTopicos - topicosCompletos
      const progressoPercentual = totalTopicos > 0 ? Math.round((topicosCompletos / totalTopicos) * 100) : 0

      // Calcular distribuição ideal para 30 dias
      const topicosPorDia = Math.ceil(topicosRestantes / daysRemaining)
      const diasRestantes = daysRemaining

      // Listar tópicos completos para a IA não recomendar
      const topicosCompletosList = editalStructure
        .flatMap(d => d.topicos.filter(t => t.completado))
        .map(t => `- ${t.numero} ${t.nome}`)
        .join('\n')

      // Listar tópicos pendentes
      const topicosPendentes = editalStructure
        .flatMap(d => d.topicos.filter(t => !t.completado).map(t => ({
          disciplina: d.nome,
          numero: t.numero,
          nome: t.nome,
          nivel: t.nivel
        })))

      // Chamar IA para gerar recomendações
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      console.log('🔑 API Key disponível:', !!apiKey)
      if (!apiKey) {
        throw new Error('VITE_GEMINI_API_KEY não configurada')
      }

      const genAI = new GoogleGenerativeAI(apiKey)
      console.log('🤖 Inicializando modelo Gemini...')
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          maxOutputTokens: 8000,
          temperature: 0.7,
        }
      })
      console.log('📝 Enviando prompt para IA...')

      const prompt = `Você é um mentor especializado em concursos públicos e planejamento de estudos.

OBJETIVO: Auxiliar o aluno a completar TODO o edital verticalizado em exatamente ${diasRestantes} dias (2 meses de estudos).

SITUAÇÃO ATUAL:
- Total de disciplinas: ${totalDisciplinas}
- Total de tópicos: ${totalTopicos}
- Tópicos já completos: ${topicosCompletos}
- Tópicos restantes: ${topicosRestantes}
- Progresso: ${progressoPercentual}%
- Dias restantes: ${diasRestantes} dias (2 meses)
- Meta: Completar ${topicosPorDia} tópicos por dia em média

TÓPICOS JÁ COMPLETOS (NÃO RECOMENDAR):
${topicosCompletosList || 'Nenhum tópico completo ainda'}

ESTRUTURA DO EDITAL:
${JSON.stringify(editalStructure, null, 2)}

TAREFA:
1. Analise o edital e identifique os tópicos mais importantes e estratégicos para estudar HOJE
2. Recomende entre 3 a 5 tópicos específicos que o aluno deve estudar hoje
3. Organize as recomendações para que o aluno possa fechar todo o edital em ${diasRestantes} dias (2 meses)
4. Priorize tópicos fundamentais que são base para outros tópicos
5. Distribua as recomendações entre diferentes disciplinas quando possível
6. Forneça conselhos motivacionais e estratégicos para um plano de 2 meses

IMPORTANTE:
- NÃO recomende tópicos já completos
- Foque em tópicos que ainda não foram estudados
- Considere a hierarquia (tópicos de nível 0 são mais importantes)
- Selecione tópicos que maximizem o aprendizado ao longo de 2 meses
- Mantenha um ritmo sustentável para 60 dias de estudos

FORMATO DE RESPOSTA (JSON OBRIGATÓRIO):
{
  "mensagemMotivacional": "Mensagem motivacional personalizada para o aluno",
  "conselho": "Conselho estratégico sobre como estudar hoje",
  "focoDoDia": "Resumo do foco principal do dia",
  "atividades": [
    {
      "disciplina": "Nome exato da disciplina",
      "topico": "Nome exato do tópico",
      "numero": "Número do tópico",
      "prioridade": "alta|media|baixa",
      "descricao": "Por que este tópico é importante estudar hoje",
      "tempoEstimado": "Tempo estimado de estudo (ex: 1h30min)",
      "dica": "Dica específica para estudar este tópico"
    }
  ],
  "estatisticas": {
    "topicosCompletos": ${topicosCompletos},
    "topicosRestantes": ${topicosRestantes},
    "progressoPercentual": ${progressoPercentual},
    "diasRestantes": ${diasRestantes},
    "topicosPorDia": ${topicosPorDia}
  }
}

Retorne APENAS o JSON válido, sem markdown, sem explicações adicionais.`

      const result = await model.generateContent(prompt)
      console.log('✅ Resposta recebida da IA')
      let aiResponse = result.response.text()
      console.log('📄 Resposta bruta:', aiResponse.substring(0, 200) + '...')

      // Limpar resposta da IA (remover markdown se houver)
      aiResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

      // Tentar fazer parse do JSON
      let recommendation
      try {
        recommendation = JSON.parse(aiResponse)
      } catch (parseError) {
        // Tentar extrair JSON da resposta
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          recommendation = JSON.parse(jsonMatch[0])
        } else {
          throw new Error('Resposta da IA não contém JSON válido')
        }
      }

      // Validar e corrigir nomes de disciplinas e tópicos
      if (recommendation.atividades) {
        recommendation.atividades = recommendation.atividades.map(ativ => {
          // Encontrar disciplina exata no edital
          const disciplinaExata = editalStructure.find(d => 
            d.nome.toLowerCase().trim() === ativ.disciplina?.toLowerCase().trim()
          )

          if (!disciplinaExata) {
            // Fallback: usar primeira disciplina disponível
            const primeiraDisciplina = editalStructure[0]
            if (primeiraDisciplina) {
              ativ.disciplina = primeiraDisciplina.nome
            }
          } else {
            ativ.disciplina = disciplinaExata.nome
          }

          // Encontrar tópico exato na disciplina
          if (disciplinaExata) {
            const topicoExato = disciplinaExata.topicos.find(t => 
              (t.nome?.toLowerCase().trim() === ativ.topico?.toLowerCase().trim()) ||
              (t.numero?.toString() === ativ.numero?.toString())
            )

            if (topicoExato && !topicoExato.completado) {
              ativ.topico = topicoExato.nome || topicoExato.numero
              ativ.numero = topicoExato.numero || ''
            } else {
              // Fallback: usar primeiro tópico não completo
              const primeiroTopicoPendente = disciplinaExata.topicos.find(t => !t.completado)
              if (primeiroTopicoPendente) {
                ativ.topico = primeiroTopicoPendente.nome || primeiroTopicoPendente.numero
                ativ.numero = primeiroTopicoPendente.numero || ''
              }
            }
          }

          return ativ
        }).filter(ativ => {
          // Filtrar atividades que já foram completadas
          const key = `${ativ.disciplina}::${ativ.topico}`
          return !completed.has(key)
        })
      }

      // Adicionar estatísticas se não vierem da IA
      if (!recommendation.estatisticas) {
        recommendation.estatisticas = {
          topicosCompletos,
          topicosRestantes,
          progressoPercentual,
          diasRestantes,
          topicosPorDia
        }
      }

      // Salvar no cache e atualizar estado
      saveCachedRecommendation(recommendation)
      setDailyRecommendation(recommendation)
    } catch (error) {
      console.error('❌ Erro ao gerar recomendação:', error)
      console.error('📋 Stack trace:', error.stack)
      setError(error.message)
      
      // Fallback: criar recomendação básica sem IA
      if (editalVerticalizado?.disciplinas) {
        const primeiraDisciplina = editalVerticalizado.disciplinas.find(d => 
          d.topicos?.some(t => !completedTopics.has(`${d.nome}::${t.nome || t.numero}`))
        )
        
        if (primeiraDisciplina) {
          const primeiroTopicoPendente = primeiraDisciplina.topicos.find(t => 
            !completedTopics.has(`${primeiraDisciplina.nome}::${t.nome || t.numero}`)
          )
          
          if (primeiroTopicoPendente) {
            setDailyRecommendation({
              mensagemMotivacional: 'Continue seus estudos! Você está no caminho certo.',
              conselho: 'Foque em estudar os tópicos do edital de forma organizada.',
              focoDoDia: `Estudar ${primeiraDisciplina.nome}`,
              atividades: [{
                disciplina: primeiraDisciplina.nome,
                topico: primeiroTopicoPendente.nome || primeiroTopicoPendente.numero,
                numero: primeiroTopicoPendente.numero || '',
                prioridade: 'alta',
                descricao: 'Tópico importante do edital',
                tempoEstimado: '1h',
                dica: 'Estude com atenção e faça anotações'
              }],
              estatisticas: {
                topicosCompletos: completedTopics.size,
                topicosRestantes: 0,
                progressoPercentual: 0,
                diasRestantes: daysRemaining,
                topicosPorDia: 0
              }
            })
          }
        }
      }
      
      // Se não houver edital, criar recomendação genérica
      if (!editalVerticalizado?.disciplinas) {
        setDailyRecommendation({
          mensagemMotivacional: 'Bem-vindo ao seu planejador de estudos!',
          conselho: 'Configure seu edital para receber recomendações personalizadas.',
          focoDoDia: 'Organizar seus materiais de estudo',
          atividades: [{
            disciplina: 'Estudos',
            topico: 'Revisão geral',
            numero: '',
            prioridade: 'media',
            descricao: 'Organize seus materiais e planeje seu cronograma',
            tempoEstimado: '30min',
            dica: 'Crie um ambiente de estudo adequado'
          }],
          estatisticas: {
            topicosCompletos: 0,
            topicosRestantes: 0,
            progressoPercentual: 0,
            diasRestantes: daysRemaining,
            topicosPorDia: 0
          }
        })
      }
    } finally {
      setLoading(false)
    }
  }

  // Carregar tópicos completos e gerar recomendação inicial
  useEffect(() => {
    if (userId && courseId) {
      loadCompletedTopics()
    }
  }, [userId, courseId])

  // Tentar carregar cache imediatamente (antes mesmo do edital estar carregado)
  useEffect(() => {
    if (userId && courseId && !hasInitialized.current) {
      // Tentar carregar do cache primeiro para mostrar mais rápido
      getCachedRecommendation().then((cached) => {
        if (cached) {
          setDailyRecommendation(cached)
          setLoading(false)
          hasInitialized.current = true
        }
      }).catch(() => {
        // Ignorar erros, vai tentar novamente quando edital carregar
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, courseId])

  // Detectar quando o edital é carregado pela primeira vez (sem reagir a mudanças subsequentes)
  useEffect(() => {
    if (editalVerticalizado && !lastEditalRef.current) {
      // Edital foi carregado pela primeira vez
      lastEditalRef.current = editalVerticalizado
      if (!hasInitialized.current && userId && courseId) {
        hasInitialized.current = true
        // Se já não tem recomendação do cache, gerar nova
        if (!dailyRecommendation) {
          generateDailyRecommendation(false)
        } else {
          setLoading(false)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editalVerticalizado])

  // Gerar recomendação quando explicitamente solicitado (todas atividades concluídas)
  useEffect(() => {
    if (!userId || !courseId || !editalVerticalizado) {
      if (!editalVerticalizado) {
        setLoading(false)
      }
      return
    }

    if (shouldUpdate) {
      // Atualização explícita solicitada (todas atividades concluídas) - FORÇAR nova geração
      generateDailyRecommendation(true) // force = true para ignorar cache
      setShouldUpdate(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, courseId, shouldUpdate])

  // Escutar eventos de atualização (só quando explicitamente solicitado)
  useEffect(() => {
    if (!userId || !courseId) return

    const handleProgressUpdate = () => {
      loadCompletedTopics().then(() => {
        setShouldUpdate(true)
      })
    }

    window.addEventListener('studyPlannerRefresh', handleProgressUpdate)
    
    return () => {
      window.removeEventListener('studyPlannerRefresh', handleProgressUpdate)
    }
    // Não incluir editalVerticalizado nas dependências
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, courseId])

  // Função para atualizar manualmente (forçar nova geração)
  const refreshRecommendation = async () => {
    // Forçar nova geração (vai sobrescrever no Firestore)
    setShouldUpdate(true)
  }

  return {
    dailyRecommendation,
    loading,
    error,
    daysRemaining,
    targetDate,
    completedTopics,
    refreshRecommendation
  }
}

