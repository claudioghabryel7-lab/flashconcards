import { useState, useEffect, useMemo } from 'react'
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { db } from '../firebase/config'
import dayjs from 'dayjs'
import { getUnifiedPrompt } from '../utils/unifiedPrompt'

/**
 * Hook para gerenciar planejamento de estudos com IA
 * Analisa progresso, estrutura de flashcards e gera recomendações personalizadas
 */
export const useStudyPlanner = (userId, courseId, allCards, cardProgress, progressData, questoesStats, editalVerticalizado) => {
  const [studyPlan, setStudyPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dailyRecommendation, setDailyRecommendation] = useState(null)
  const [targetDate, setTargetDate] = useState(null)
  const [metaDays, setMetaDays] = useState(30) // Meta padrão: 30 dias
  const [lastUpdateDate, setLastUpdateDate] = useState(null)

  // Calcular estatísticas de progresso com análise de dificuldade
  const progressStats = useMemo(() => {
    if (!allCards || !cardProgress) return null

    // Organizar cards por matéria e módulo
    const byMateria = {}
    const byModulo = {}

    allCards.forEach(card => {
      const materia = card.materia || 'Geral'
      const modulo = card.modulo || 'Geral'
      const key = `${materia}::${modulo}`
      const progress = cardProgress[card.id]

      // Por matéria
      if (!byMateria[materia]) {
        byMateria[materia] = {
          total: 0,
          studied: 0,
          modules: new Set(),
          accuracy: 0,
          // Análise de dificuldade
          difficultCards: 0,      // Cards marcados como hard/again
          easyCards: 0,           // Cards marcados como easy
          againCount: 0,          // Total de "again"
          hardCount: 0,           // Total de "hard"
          goodCount: 0,           // Total de "good"
          easyCount: 0,           // Total de "easy"
          averageEaseFactor: 0,   // Facilidade média
          cardsNeedingReview: 0   // Cards que precisam revisão urgente
        }
      }
      byMateria[materia].total++
      byMateria[materia].modules.add(modulo)
      
      if (progress?.reviewCount > 0) {
        byMateria[materia].studied++
        
        // Analisar dificuldade
        const lastDifficulty = progress.lastDifficulty
        if (lastDifficulty === 'again') {
          byMateria[materia].againCount++
          byMateria[materia].difficultCards++
        } else if (lastDifficulty === 'hard') {
          byMateria[materia].hardCount++
          byMateria[materia].difficultCards++
        } else if (lastDifficulty === 'good') {
          byMateria[materia].goodCount++
        } else if (lastDifficulty === 'easy') {
          byMateria[materia].easyCount++
          byMateria[materia].easyCards++
        }
        
        // Verificar se precisa revisão urgente (again ou hard recente)
        if (lastDifficulty === 'again' || lastDifficulty === 'hard') {
          const nextReview = dayjs(progress.nextReview)
          if (nextReview.isBefore(dayjs().add(1, 'day'))) {
            byMateria[materia].cardsNeedingReview++
          }
        }
      }

      // Por módulo
      if (!byModulo[key]) {
        byModulo[key] = {
          materia,
          modulo,
          total: 0,
          studied: 0,
          accuracy: 0,
          // Análise de dificuldade
          difficultCards: 0,
          easyCards: 0,
          againCount: 0,
          hardCount: 0,
          goodCount: 0,
          easyCount: 0,
          averageEaseFactor: 0,
          cardsNeedingReview: 0
        }
      }
      byModulo[key].total++
      
      if (progress?.reviewCount > 0) {
        byModulo[key].studied++
        
        // Analisar dificuldade
        const lastDifficulty = progress.lastDifficulty
        if (lastDifficulty === 'again') {
          byModulo[key].againCount++
          byModulo[key].difficultCards++
        } else if (lastDifficulty === 'hard') {
          byModulo[key].hardCount++
          byModulo[key].difficultCards++
        } else if (lastDifficulty === 'good') {
          byModulo[key].goodCount++
        } else if (lastDifficulty === 'easy') {
          byModulo[key].easyCount++
          byModulo[key].easyCards++
        }
        
        // Verificar se precisa revisão urgente
        if (lastDifficulty === 'again' || lastDifficulty === 'hard') {
          const nextReview = dayjs(progress.nextReview)
          if (nextReview.isBefore(dayjs().add(1, 'day'))) {
            byModulo[key].cardsNeedingReview++
          }
        }
      }
    })

    // Calcular porcentagens e métricas de dificuldade
    Object.keys(byMateria).forEach(materia => {
      const stats = byMateria[materia]
      stats.percentage = stats.total > 0 
        ? Math.round((stats.studied / stats.total) * 100) 
        : 0
      stats.modules = Array.from(stats.modules)
      
      // Calcular taxa de retenção (easy + good vs again + hard)
      const totalRatings = stats.againCount + stats.hardCount + stats.goodCount + stats.easyCount
      if (totalRatings > 0) {
        const positiveRatings = stats.goodCount + stats.easyCount
        stats.retentionRate = Math.round((positiveRatings / totalRatings) * 100)
      } else {
        stats.retentionRate = 0
      }
      
      // Calcular facilidade média
      let totalEaseFactor = 0
      let easeFactorCount = 0
      allCards.forEach(card => {
        if (card.materia === materia && cardProgress[card.id]?.easeFactor) {
          totalEaseFactor += cardProgress[card.id].easeFactor
          easeFactorCount++
        }
      })
      stats.averageEaseFactor = easeFactorCount > 0 
        ? (totalEaseFactor / easeFactorCount).toFixed(2) 
        : 0
      
      // Identificar se é matéria problemática (muitos again/hard)
      const difficultRatio = totalRatings > 0 
        ? (stats.againCount + stats.hardCount) / totalRatings 
        : 0
      stats.isProblematic = difficultRatio > 0.3 // Mais de 30% de dificuldade
    })

    Object.keys(byModulo).forEach(key => {
      const stats = byModulo[key]
      stats.percentage = stats.total > 0 
        ? Math.round((stats.studied / stats.total) * 100) 
        : 0
      
      // Calcular taxa de retenção
      const totalRatings = stats.againCount + stats.hardCount + stats.goodCount + stats.easyCount
      if (totalRatings > 0) {
        const positiveRatings = stats.goodCount + stats.easyCount
        stats.retentionRate = Math.round((positiveRatings / totalRatings) * 100)
      } else {
        stats.retentionRate = 0
      }
      
      // Calcular facilidade média
      let totalEaseFactor = 0
      let easeFactorCount = 0
      allCards.forEach(card => {
        if (card.materia === stats.materia && card.modulo === stats.modulo && cardProgress[card.id]?.easeFactor) {
          totalEaseFactor += cardProgress[card.id].easeFactor
          easeFactorCount++
        }
      })
      stats.averageEaseFactor = easeFactorCount > 0 
        ? (totalEaseFactor / easeFactorCount).toFixed(2) 
        : 0
      
      // Identificar se é módulo problemático
      const difficultRatio = totalRatings > 0 
        ? (stats.againCount + stats.hardCount) / totalRatings 
        : 0
      stats.isProblematic = difficultRatio > 0.3
    })

    // Adicionar taxa de acerto por matéria (de questoesStats)
    if (questoesStats?.byMateria) {
      Object.keys(byMateria).forEach(materia => {
        const materiaStats = questoesStats.byMateria[materia]
        if (materiaStats) {
          const total = (materiaStats.correct || 0) + (materiaStats.wrong || 0)
          byMateria[materia].accuracy = total > 0
            ? Math.round((materiaStats.correct / total) * 100)
            : 0
        }
      })
    }

    // Identificar matérias/módulos pendentes (priorizar problemáticas)
    const pendingMaterias = Object.entries(byMateria)
      .filter(([_, stats]) => stats.percentage < 100)
      .sort((a, b) => {
        // Priorizar: problemáticas > menor porcentagem > menor retenção
        if (a[1].isProblematic && !b[1].isProblematic) return -1
        if (!a[1].isProblematic && b[1].isProblematic) return 1
        if (a[1].percentage !== b[1].percentage) return a[1].percentage - b[1].percentage
        return a[1].retentionRate - b[1].retentionRate
      })

    const pendingModulos = Object.values(byModulo)
      .filter(stats => stats.percentage < 100)
      .sort((a, b) => {
        // Priorizar: problemáticos > menor porcentagem > menor retenção
        if (a.isProblematic && !b.isProblematic) return -1
        if (!a.isProblematic && b.isProblematic) return 1
        if (a.percentage !== b.percentage) return a.percentage - b.percentage
        return a.retentionRate - b.retentionRate
      })
    
    // Calcular estatísticas gerais de dificuldade
    let totalAgain = 0
    let totalHard = 0
    let totalGood = 0
    let totalEasy = 0
    let totalCardsNeedingReview = 0
    
    Object.values(byMateria).forEach(stats => {
      totalAgain += stats.againCount
      totalHard += stats.hardCount
      totalGood += stats.goodCount
      totalEasy += stats.easyCount
      totalCardsNeedingReview += stats.cardsNeedingReview
    })
    
    const totalRatings = totalAgain + totalHard + totalGood + totalEasy
    const overallRetentionRate = totalRatings > 0
      ? Math.round(((totalGood + totalEasy) / totalRatings) * 100)
      : 0

    // Calcular total de horas estudadas
    const totalHours = progressData?.reduce((sum, item) => sum + parseFloat(item.hours || 0), 0) || 0

    // Calcular dias de estudo
    const studyDays = new Set(progressData?.map(item => item.date) || []).size

    return {
      byMateria,
      byModulo,
      pendingMaterias,
      pendingModulos,
      totalHours,
      studyDays,
      totalCards: allCards.length,
      studiedCards: Object.keys(cardProgress).filter(id => cardProgress[id]?.reviewCount > 0).length,
      // Estatísticas de dificuldade
      difficultyStats: {
        totalAgain,
        totalHard,
        totalGood,
        totalEasy,
        totalRatings,
        overallRetentionRate,
        totalCardsNeedingReview,
        difficultRatio: totalRatings > 0 
          ? Math.round(((totalAgain + totalHard) / totalRatings) * 100) 
          : 0
      }
    }
  }, [allCards, cardProgress, progressData, questoesStats])

  // Gerar recomendação diária com IA
  const generateDailyRecommendation = async () => {
    if (!userId || !courseId || !progressStats) return

    setLoading(true)
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey) {
        throw new Error('VITE_GEMINI_API_KEY não configurada')
      }

      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.0-flash-exp',
        generationConfig: {
          maxOutputTokens: 4000,
          temperature: 0.7,
        }
      })

      // Buscar informações do curso
      const unified = await getUnifiedPrompt(courseId)
      const courseDoc = await getDoc(doc(db, 'courses', courseId))
      const courseData = courseDoc.exists() ? courseDoc.data() : {}
      const courseName = courseData.name || courseData.competition || 'o concurso'

      // Preparar dados de progresso com análise de dificuldade
      const progressSummary = {
        totalCards: progressStats.totalCards,
        studiedCards: progressStats.studiedCards,
        totalHours: progressStats.totalHours.toFixed(1),
        studyDays: progressStats.studyDays,
        // Estatísticas de dificuldade geral
        difficultyStats: {
          retentionRate: progressStats.difficultyStats.overallRetentionRate,
          difficultRatio: progressStats.difficultyStats.difficultRatio,
          cardsNeedingReview: progressStats.difficultyStats.totalCardsNeedingReview,
          breakdown: {
            again: progressStats.difficultyStats.totalAgain,
            hard: progressStats.difficultyStats.totalHard,
            good: progressStats.difficultyStats.totalGood,
            easy: progressStats.difficultyStats.totalEasy
          }
        },
        pendingMaterias: progressStats.pendingMaterias.slice(0, 5).map(([materia, stats]) => ({
          materia,
          percentage: stats.percentage,
          accuracy: stats.accuracy,
          modules: stats.modules.length,
          // Análise de dificuldade por matéria
          isProblematic: stats.isProblematic,
          retentionRate: stats.retentionRate,
          difficultCards: stats.difficultCards,
          easyCards: stats.easyCards,
          cardsNeedingReview: stats.cardsNeedingReview,
          difficultyBreakdown: {
            again: stats.againCount,
            hard: stats.hardCount,
            good: stats.goodCount,
            easy: stats.easyCount
          }
        })),
        pendingModulos: progressStats.pendingModulos.slice(0, 10).map(stats => ({
          materia: stats.materia,
          modulo: stats.modulo,
          percentage: stats.percentage,
          // Análise de dificuldade por módulo
          isProblematic: stats.isProblematic,
          retentionRate: stats.retentionRate,
          difficultCards: stats.difficultCards,
          cardsNeedingReview: stats.cardsNeedingReview
        }))
      }

      // Calcular dias restantes até a meta
      const today = dayjs()
      const target = targetDate ? dayjs(targetDate) : today.add(metaDays, 'days')
      const daysRemaining = Math.max(0, target.diff(today, 'days'))
      const progressPercentage = metaDays > 0 
        ? Math.min(100, Math.round((progressStats.studyDays / metaDays) * 100))
        : 0

      // Preparar estrutura do edital (se disponível)
      let editalStructure = ''
      if (editalVerticalizado?.secoes) {
        editalStructure = editalVerticalizado.secoes
          .slice(0, 10)
          .map(secao => `- ${secao.titulo || secao.nome || 'Seção'}`)
          .join('\n')
      }

      const prompt = `Você é um mentor especializado em concursos públicos, focado em ajudar alunos a alcançarem aprovação.

CONTEXTO DO CURSO:
- Curso: ${courseName}
${unified?.banca ? `- Banca: ${unified.banca}\n` : ''}
- Meta: Completar todas as matérias em ${metaDays} dias
- Dias restantes: ${daysRemaining} dias
- Progresso atual: ${progressPercentage}% dos dias de estudo completados

PROGRESSO DO ALUNO:
- Cards estudados: ${progressSummary.studiedCards} de ${progressSummary.totalCards} (${Math.round((progressSummary.studiedCards / progressSummary.totalCards) * 100)}%)
- Horas de estudo: ${progressSummary.totalHours}h
- Dias de estudo: ${progressSummary.studyDays} dias

ANÁLISE DE DESEMPENHO GERAL:
- Taxa de Retenção: ${progressSummary.difficultyStats.retentionRate}% (quanto mais alto, melhor)
- Cards Difíceis: ${progressSummary.difficultyStats.difficultRatio}% marcados como difícil/errado
- Cards Urgentes para Revisão: ${progressSummary.difficultyStats.cardsNeedingReview} cards
- Distribuição de Dificuldade:
  * Again (Errei): ${progressSummary.difficultyStats.breakdown.again} cards
  * Hard (Difícil): ${progressSummary.difficultyStats.breakdown.hard} cards
  * Good (Bom): ${progressSummary.difficultyStats.breakdown.good} cards
  * Easy (Fácil): ${progressSummary.difficultyStats.breakdown.easy} cards

MATÉRIAS PENDENTES (prioridade - problemáticas primeiro):
${progressSummary.pendingMaterias.map((m, i) => {
  const problematic = m.isProblematic ? '⚠️ PROBLEMÁTICA' : ''
  const difficultyInfo = m.difficultCards > 0 
    ? `(${m.difficultCards} cards difíceis, ${m.retentionRate}% retenção)`
    : ''
  return `${i + 1}. ${m.materia}: ${m.percentage}% completo, ${m.accuracy}% acerto, ${m.modules} módulos ${problematic} ${difficultyInfo}`
}).join('\n')}

MÓDULOS PENDENTES (próximos a estudar - priorizar problemáticos):
${progressSummary.pendingModulos.slice(0, 5).map((m, i) => {
  const problematic = m.isProblematic ? '⚠️ PROBLEMÁTICO' : ''
  const reviewInfo = m.cardsNeedingReview > 0 
    ? `(${m.cardsNeedingReview} cards precisam revisão urgente)`
    : ''
  return `${i + 1}. ${m.materia} - ${m.modulo}: ${m.percentage}% completo ${problematic} ${reviewInfo}`
}).join('\n')}

${editalStructure ? `ESTRUTURA DO EDITAL (referência):\n${editalStructure}\n` : ''}

FERRAMENTAS DISPONÍVEIS:
1. Flashcards - Sistema de repetição espaçada para estudar teoria
2. FlashQuestões - Questões geradas por IA para praticar
3. Simulados - Avaliação completa do conhecimento
4. Treino de Redação - Prática de escrita dissertativa
5. Mapas Mentais - Revisão visual do conteúdo

TAREFA:
Crie um plano de estudos personalizado para HOJE (${today.format('DD/MM/YYYY')}) que:
1. Identifique o que o aluno PRECISA estudar hoje baseado no progresso E na dificuldade
2. PRIORIZE matérias/módulos PROBLEMÁTICOS (muitos cards marcados como difícil/errado)
3. Foque em módulos com muitos cards precisando revisão urgente
4. Considere a taxa de retenção (matérias com baixa retenção precisam de mais prática)
5. Sugira revisão de cards difíceis ANTES de estudar conteúdo novo
6. Sugira o uso das ferramentas disponíveis de forma estratégica
7. Seja motivador mas realista
8. Calcule quantos módulos/cards precisam ser estudados por dia para atingir a meta

ANÁLISE INTELIGENTE OBRIGATÓRIA:
- Se a taxa de retenção geral está abaixo de 70%, o aluno precisa focar em REVISAR cards difíceis
- Se há muitos cards marcados como "again" ou "hard", priorize REVISÃO sobre conteúdo novo
- Matérias problemáticas devem ser estudadas com mais frequência e com mais questões práticas
- Cards que precisam revisão urgente devem ser priorizados HOJE
- Balance entre revisão de cards difíceis e estudo de conteúdo novo baseado na taxa de retenção

IMPORTANTE:
- O plano deve ser específico e acionável
- Sugira módulos concretos para estudar, priorizando os problemáticos
- Indique qual ferramenta usar para cada atividade
- Se há cards urgentes para revisar, inclua isso como PRIMEIRA atividade do dia
- Balance entre conteúdo novo e revisão baseado na análise de dificuldade
- Se uma matéria tem muitos "again", sugira estudar ela com mais frequência

FORMATO DE RESPOSTA (JSON):
{
  "mensagemMotivacional": "Mensagem curta e motivacional (1-2 frases)",
  "focoDoDia": "O que estudar hoje (ex: 'Português - Interpretação de Texto')",
  "atividades": [
    {
      "tipo": "flashcards" | "questoes" | "simulado" | "redacao" | "mapas",
      "materia": "Nome da matéria",
      "modulo": "Nome do módulo (se aplicável)",
      "descricao": "O que fazer nesta atividade",
      "tempoEstimado": "Tempo estimado (ex: '30 minutos')",
      "prioridade": "alta" | "media" | "baixa"
    }
  ],
  "revisoes": {
    "cardsParaRevisar": 0,
    "descricao": "Quantos cards precisam ser revisados hoje"
  },
  "progressoParaMeta": {
    "cardsRestantes": 0,
    "cardsPorDia": 0,
    "materiasRestantes": 0,
    "mensagem": "Mensagem sobre o progresso em relação à meta"
  },
  "dicas": [
    "Dica 1",
    "Dica 2"
  ]
}

Retorne APENAS o JSON válido, sem markdown, sem explicações adicionais.`

      const result = await model.generateContent(prompt)
      const response = await result.response
      let responseText = response.text().trim()

      // Limpar markdown se houver
      if (responseText.startsWith('```json')) {
        responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      } else if (responseText.startsWith('```')) {
        responseText = responseText.replace(/```\n?/g, '').trim()
      }

      const recommendation = JSON.parse(responseText)
      setDailyRecommendation(recommendation)
      setLoading(false)
      
      // Salvar no cache automaticamente
      saveCachedRecommendation(recommendation)
      saveLastUpdate()

      return recommendation
    } catch (error) {
      console.error('Erro ao gerar recomendação:', error)
      setLoading(false)
      
      // Fallback: criar recomendação básica sem IA
      const fallback = createFallbackRecommendation()
      setDailyRecommendation(fallback)
      return fallback
    }
  }

  // Criar recomendação básica sem IA (fallback)
  const createFallbackRecommendation = () => {
    if (!progressStats) return null

    const nextMateria = progressStats.pendingMaterias[0]
    const nextModulo = progressStats.pendingModulos[0]

    const cardsRemaining = progressStats.totalCards - progressStats.studiedCards
    const cardsPerDay = metaDays > 0 ? Math.ceil(cardsRemaining / Math.max(1, metaDays - progressStats.studyDays)) : 0

    return {
      mensagemMotivacional: "Continue focado! Cada dia de estudo te aproxima da aprovação.",
      focoDoDia: nextMateria ? `${nextMateria[0]}` : "Continue revisando os flashcards",
      atividades: [
        {
          tipo: "flashcards",
          materia: nextModulo?.materia || "Geral",
          modulo: nextModulo?.modulo || "Geral",
          descricao: nextModulo 
            ? `Estude os flashcards de ${nextModulo.materia} - ${nextModulo.modulo}`
            : "Continue estudando os flashcards",
          tempoEstimado: "45 minutos",
          prioridade: "alta"
        },
        {
          tipo: "questoes",
          materia: nextMateria?.[0] || "Geral",
          descricao: "Pratique questões para fixar o conteúdo",
          tempoEstimado: "30 minutos",
          prioridade: "media"
        }
      ],
      revisoes: {
        cardsParaRevisar: progressStats.difficultyStats?.totalCardsNeedingReview || 0,
        cardsUrgentes: progressStats.difficultyStats?.totalCardsNeedingReview || 0,
        descricao: progressStats.difficultyStats?.totalCardsNeedingReview > 0
          ? `Revise os cards que estão vencidos. ATENÇÃO: ${progressStats.difficultyStats.totalCardsNeedingReview} cards difíceis precisam revisão urgente!`
          : "Revise os cards que estão vencidos"
      },
      progressoParaMeta: {
        cardsRestantes: cardsRemaining,
        cardsPorDia: cardsPerDay,
        materiasRestantes: progressStats.pendingMaterias.length,
        mensagem: `Faltam ${cardsRemaining} cards para completar. Estude ${cardsPerDay} cards por dia para atingir a meta.`
      },
      dicas: [
        "Mantenha a consistência nos estudos",
        "Revise os cards regularmente"
      ]
    }
  }

  // Verificar se precisa atualizar automaticamente (11:30 da manhã) - INDIVIDUAL POR USUÁRIO
  const shouldUpdateToday = () => {
    if (!userId) return false
    
    const now = dayjs()
    const today = now.format('YYYY-MM-DD')
    
    // Criar horário de atualização (11:30) para HOJE
    const updateTime = dayjs().hour(11).minute(30).second(0).millisecond(0)
    
    // Verificar se já passou das 11:30 hoje
    const hasPassedUpdateTime = now.isAfter(updateTime) || now.isSame(updateTime)
    
    // Chave única por usuário E curso
    const cacheKey = `studyPlanner_lastUpdate_${userId}_${courseId || 'alego'}`
    
    try {
      const lastUpdate = localStorage.getItem(cacheKey)
      
      if (!lastUpdate) {
        // Primeira vez - atualizar se já passou das 11:30
        return hasPassedUpdateTime
      }
      
      const lastUpdateDate = dayjs(lastUpdate)
      const lastUpdateDay = lastUpdateDate.format('YYYY-MM-DD')
      
      // Se já atualizou hoje, não atualizar novamente
      if (lastUpdateDay === today) {
        return false
      }
      
      // Se não atualizou hoje e já passou das 11:30, atualizar
      return hasPassedUpdateTime
    } catch (err) {
      console.warn('Erro ao verificar última atualização:', err)
      // Em caso de erro, permitir atualização se já passou das 11:30
      return hasPassedUpdateTime
    }
  }

  // Salvar data da última atualização - INDIVIDUAL POR USUÁRIO
  const saveLastUpdate = () => {
    if (!userId) return
    
    try {
      const cacheKey = `studyPlanner_lastUpdate_${userId}_${courseId || 'alego'}`
      const now = dayjs()
      localStorage.setItem(cacheKey, now.toISOString())
      setLastUpdateDate(now.format('YYYY-MM-DD'))
      console.log(`✅ Atualização salva para usuário ${userId} às ${now.format('HH:mm:ss')}`)
    } catch (err) {
      console.warn('Erro ao salvar última atualização:', err)
    }
  }

  // Carregar recomendação do cache se disponível - INDIVIDUAL POR USUÁRIO
  const loadCachedRecommendation = () => {
    if (!userId) return null
    
    const cacheKey = `studyPlanner_recommendation_${userId}_${courseId || 'alego'}`
    try {
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        const { data, date } = JSON.parse(cached)
        const cachedDate = dayjs(date)
        const today = dayjs().format('YYYY-MM-DD')
        
        // Se é de hoje, usar cache (mesmo que ainda não tenha passado das 11:30)
        // Isso evita gerar múltiplas vezes no mesmo dia
        if (cachedDate.format('YYYY-MM-DD') === today) {
          console.log(`📋 Usando recomendação em cache para usuário ${userId} (de ${cachedDate.format('HH:mm')})`)
          return data
        } else {
          // Cache de outro dia - remover
          localStorage.removeItem(cacheKey)
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar recomendação do cache:', err)
      // Limpar cache corrompido
      try {
        localStorage.removeItem(cacheKey)
      } catch {}
    }
    return null
  }

  // Salvar recomendação no cache - INDIVIDUAL POR USUÁRIO
  const saveCachedRecommendation = (recommendation) => {
    if (!userId || !recommendation) return
    
    const cacheKey = `studyPlanner_recommendation_${userId}_${courseId || 'alego'}`
    try {
      localStorage.setItem(cacheKey, JSON.stringify({
        data: recommendation,
        date: dayjs().toISOString(),
        userId, // Garantir que é do usuário correto
        courseId: courseId || 'alego'
      }))
      console.log(`💾 Recomendação salva no cache para usuário ${userId}`)
    } catch (err) {
      console.warn('Erro ao salvar recomendação no cache:', err)
    }
  }

  // Gerar recomendação ao carregar ou quando dados mudarem
  useEffect(() => {
    if (!userId || !courseId || !progressStats) {
      setLoading(false)
      return
    }

    // Tentar carregar do cache primeiro
    const cached = loadCachedRecommendation()
    if (cached) {
      setDailyRecommendation(cached)
      setLoading(false)
      
      // Verificar se precisa atualizar (já passou das 11:30 e ainda não atualizou hoje)
      // INDIVIDUAL POR USUÁRIO - cada usuário tem seu próprio timestamp
      if (shouldUpdateToday()) {
        const today = dayjs().format('YYYY-MM-DD')
        const cacheKey = `studyPlanner_lastUpdate_${userId}_${courseId || 'alego'}`
        
        try {
          const lastUpdate = localStorage.getItem(cacheKey)
          const lastUpdateDate = lastUpdate ? dayjs(lastUpdate).format('YYYY-MM-DD') : null
          
          // Só atualizar se não atualizou hoje
          if (!lastUpdateDate || lastUpdateDate !== today) {
            console.log(`🔄 Atualizando recomendação em background para usuário ${userId}`)
            
            // Atualizar em background sem bloquear a UI
            setTimeout(() => {
              generateDailyRecommendation().then(recommendation => {
                if (recommendation) {
                  saveCachedRecommendation(recommendation)
                  saveLastUpdate()
                }
              }).catch(err => {
                console.error(`❌ Erro ao atualizar em background para usuário ${userId}:`, err)
              })
            }, 1000)
          }
        } catch (err) {
          console.warn('Erro ao verificar última atualização:', err)
        }
      }
      return
    }

    // Se não tem cache, verificar se deve gerar agora
    // INDIVIDUAL POR USUÁRIO - cada usuário tem seu próprio horário de atualização
    if (shouldUpdateToday() || !dailyRecommendation) {
      console.log(`🔄 Gerando nova recomendação para usuário ${userId}`)
      generateDailyRecommendation().then(recommendation => {
        if (recommendation) {
          saveCachedRecommendation(recommendation)
          saveLastUpdate()
        }
      }).catch(err => {
        console.error(`❌ Erro ao gerar recomendação para usuário ${userId}:`, err)
        setLoading(false)
      })
    } else {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, courseId, progressStats?.totalCards, progressStats?.studiedCards])

  // Verificar periodicamente se já passou das 11:30 (a cada minuto) - INDIVIDUAL POR USUÁRIO
  useEffect(() => {
    if (!userId || !courseId || !progressStats) return

    console.log(`🕐 Iniciando verificação periódica para usuário ${userId} (curso: ${courseId || 'alego'})`)

    const checkInterval = setInterval(() => {
      const now = dayjs()
      const currentHour = now.hour()
      const currentMinute = now.minute()
      
      // Só verificar se estiver próximo ou depois das 11:30 (otimização)
      if (currentHour > 11 || (currentHour === 11 && currentMinute >= 30)) {
        if (shouldUpdateToday()) {
          const today = dayjs().format('YYYY-MM-DD')
          const cacheKey = `studyPlanner_lastUpdate_${userId}_${courseId || 'alego'}`
          
          try {
            const lastUpdate = localStorage.getItem(cacheKey)
            const lastUpdateDate = lastUpdate ? dayjs(lastUpdate).format('YYYY-MM-DD') : null
            
            // Só atualizar se não atualizou hoje
            if (!lastUpdateDate || lastUpdateDate !== today) {
              console.log(`🔄 Atualizando recomendação para usuário ${userId} às ${now.format('HH:mm:ss')}`)
              
              // Atualizar automaticamente
              generateDailyRecommendation().then(recommendation => {
                if (recommendation) {
                  saveCachedRecommendation(recommendation)
                  saveLastUpdate()
                  console.log(`✅ Recomendação atualizada com sucesso para usuário ${userId}`)
                }
              }).catch(err => {
                console.error(`❌ Erro ao atualizar recomendação para usuário ${userId}:`, err)
              })
            }
          } catch (err) {
            console.warn('Erro ao verificar última atualização no intervalo:', err)
          }
        }
      }
    }, 60000) // Verificar a cada minuto

    return () => {
      clearInterval(checkInterval)
      console.log(`🛑 Parando verificação periódica para usuário ${userId}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, courseId, progressStats])

  // Calcular data alvo
  useEffect(() => {
    if (metaDays > 0) {
      const target = dayjs().add(metaDays, 'days')
      setTargetDate(target.format('YYYY-MM-DD'))
    }
  }, [metaDays])

  return {
    studyPlan,
    dailyRecommendation,
    progressStats,
    loading,
    targetDate,
    metaDays,
    setMetaDays
  }
}

