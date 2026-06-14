import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, getDoc, setDoc, serverTimestamp, writeBatch, collection } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import {
  SparklesIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

const VesperaDeProvaConfig = () => {
  const { user, isAdmin } = useAuth()
  const { darkMode } = useDarkMode()
  const navigate = useNavigate()
  const { courseId } = useParams()
  
  const [courseName, setCourseName] = useState('')
  const [editalVerticalizado, setEditalVerticalizado] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generationStatus, setGenerationStatus] = useState('')
  
  // Progresso da geração
  const [generationProgress, setGenerationProgress] = useState(0)
  const [existingProgress, setExistingProgress] = useState(null)
  
  // Configurações
  const [bancaExaminadora, setBancaExaminadora] = useState('')
  const [concurso, setConcurso] = useState('')
  const [questoesPorMateria, setQuestoesPorMateria] = useState({})
  
  // Carregar dados do curso
  useEffect(() => {
    if (!courseId) return
    
    const loadCourseData = async () => {
      try {
        setLoading(true)
        
        console.log('🔍 [VesperaDeProvaConfig] Carregando dados do curso:', courseId)
        console.log('🔍 [VesperaDeProvaConfig] Usuário autenticado:', !!user)
        console.log('🔍 [VesperaDeProvaConfig] É admin:', isAdmin)
        
        // Carregar nome do curso
        const courseDoc = await getDoc(doc(db, 'courses', courseId))
        if (courseDoc.exists()) {
          const data = courseDoc.data()
          setCourseName(data.name || data.competition || '')
          setConcurso(data.competition || '')
          console.log('✅ [VesperaDeProvaConfig] Curso carregado:', data.name)
        } else {
          console.error('❌ [VesperaDeProvaConfig] Curso não encontrado:', courseId)
        }
        
        // Carregar edital verticalizado
        const editalRef = doc(db, 'courses', courseId, 'editalVerticalizado', 'principal')
        const editalSnapshot = await getDoc(editalRef)
        
        if (editalSnapshot.exists()) {
          const editalData = editalSnapshot.data()
          console.log('✅ [VesperaDeProvaConfig] Edital verticalizado carregado')
          
          // Verificar se está dividido em partes
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
            
            setEditalVerticalizado({ ...editalData, disciplinas: todasDisciplinas })
            console.log('✅ [VesperaDeProvaConfig] Edital com partes carregado, total disciplinas:', todasDisciplinas.length)
          } else {
            setEditalVerticalizado(editalData)
            console.log('✅ [VesperaDeProvaConfig] Edital sem partes carregado, total disciplinas:', editalData.disciplinas?.length)
          }
          
          // Inicializar questões por matéria com valor padrão de 5
          const initialQuestoes = {}
          editalData.disciplinas?.forEach((disciplina, idx) => {
            initialQuestoes[idx] = 5
          })
          setQuestoesPorMateria(initialQuestoes)
        } else {
          console.error('❌ [VesperaDeProvaConfig] Edital verticalizado não encontrado')
        }
        
      } catch (error) {
        console.error('❌ [VesperaDeProvaConfig] Erro ao carregar dados:', error)
        console.error('❌ [VesperaDeProvaConfig] Código do erro:', error.code)
        console.error('❌ [VesperaDeProvaConfig] Mensagem:', error.message)
        alert(`Erro ao carregar dados: ${error.message}`)
      } finally {
        setLoading(false)
      }
    }
    
    loadCourseData()
    
    // Carregar progresso existente da geração
    const loadExistingProgress = async () => {
      try {
        const progressRef = doc(db, 'courses', courseId, 'vesperaDeProva', 'progress')
        const progressDoc = await getDoc(progressRef)
        
        if (progressDoc.exists()) {
          const progressData = progressDoc.data()
          console.log('📊 [VesperaDeProvaConfig] Progresso existente encontrado:', progressData)
          setExistingProgress(progressData)
        }
      } catch (error) {
        console.log('ℹ️ [VesperaDeProvaConfig] Nenhum progresso existente encontrado')
      }
    }
    
    loadExistingProgress()
  }, [courseId, user, isAdmin])
  
  // Gerar material com IA (mesma abordagem do EditalVerticalizado)
  const generateMaterial = async () => {
    if (!isAdmin) {
      alert('Apenas administradores podem gerar material de Véspera de Prova.')
      return
    }
    
    if (!user) {
      alert('Você precisa estar autenticado para gerar material.')
      return
    }
    
    if (!bancaExaminadora || !concurso) {
      alert('Preencha a banca examinadora e o concurso.')
      return
    }
    
    if (!editalVerticalizado?.disciplinas) {
      alert('Edital verticalizado não encontrado.')
      return
    }
    
    setGenerating(true)
    setGenerationStatus('Preparando estrutura do edital...')
    setGenerationProgress(0)
    
    try {
      console.log('🚀 [VesperaDeProvaConfig] Iniciando geração de material')
      console.log('🚀 [VesperaDeProvaConfig] Curso:', courseName)
      console.log('🚀 [VesperaDeProvaConfig] Concurso:', concurso)
      console.log('🚀 [VesperaDeProvaConfig] Banca:', bancaExaminadora)
      console.log('🚀 [VesperaDeProvaConfig] Total disciplinas:', editalVerticalizado.disciplinas.length)
      
      // Verificar se existe progresso anterior com as mesmas configurações
      let startFromPart = 0
      let existingMaterial = []
      
      if (existingProgress && existingProgress.config) {
        const configMatch = 
          existingProgress.config.banca === bancaExaminadora &&
          existingProgress.config.concurso === concurso &&
          JSON.stringify(existingProgress.config.questoesPorMateria) === JSON.stringify(questoesPorMateria)
        
        if (configMatch && existingProgress.status === 'in_progress') {
          console.log('📊 [VesperaDeProvaConfig] Progresso compatível encontrado, retomando de onde parou')
          console.log('📊 [VesperaDeProvaConfig] Partes concluídas:', existingProgress.completedParts)
          startFromPart = existingProgress.completedParts.length
          existingMaterial = existingProgress.material || []
          
          // Carregar material parcial do Firestore
          try {
            const materialRef = doc(db, 'courses', courseId, 'vesperaDeProva', 'material')
            const materialDoc = await getDoc(materialRef)
            if (materialDoc.exists()) {
              const materialData = materialDoc.data()
              existingMaterial = materialData.material || []
              console.log('📊 [VesperaDeProvaConfig] Material parcial carregado:', existingMaterial.length, 'disciplinas')
            }
          } catch (error) {
            console.log('ℹ️ [VesperaDeProvaConfig] Não foi possível carregar material parcial')
          }
          
          setGenerationStatus(`Retomando geração... (${existingProgress.completedParts.length}/${existingProgress.totalParts} partes concluídas)`)
        } else {
          console.log('📊 [VesperaDeProvaConfig] Progresso existente não compatível, iniciando nova geração')
          console.log('📊 [VesperaDeProvaConfig] Config anterior:', existingProgress.config)
          console.log('📊 [VesperaDeProvaConfig] Config atual:', { banca: bancaExaminadora, concurso: concurso, questoesPorMateria })
          // Limpar progresso antigo completamente
          const { deleteDoc } = await import('firebase/firestore')
          const progressRef = doc(db, 'courses', courseId, 'vesperaDeProva', 'progress')
          await deleteDoc(progressRef)
          console.log('🗑️ [VesperaDeProvaConfig] Progresso antigo removido')
        }
      }
      
      // Dividir disciplinas em partes (1 disciplina por parte para evitar corte do JSON devido ao conteúdo detalhado)
      const disciplinasPorParte = 1
      const totalPartes = Math.ceil(editalVerticalizado.disciplinas.length / disciplinasPorParte)
      
      console.log(`📦 [VesperaDeProvaConfig] Dividindo em ${totalPartes} partes (1 disciplina por parte para evitar truncamento)`)
      console.log(`📦 [VesperaDeProvaConfig] Iniciando da parte ${startFromPart + 1}/${totalPartes}`)
      
      const todasDisciplinas = [...existingMaterial]
      const completedParts = new Set(existingProgress?.completedParts || [])
      
      for (let parte = startFromPart; parte < totalPartes; parte++) {
        // Adicionar delay entre partes para evitar rate limit (mínimo 30 segundos)
        if (parte > 0) {
          console.log(`⏳ [VesperaDeProvaConfig] Aguardando 30 segundos para evitar rate limit...`)
          setGenerationStatus(`Aguardando 30 segundos para evitar rate limit...`)
          await new Promise(resolve => setTimeout(resolve, 30000))
        }
        
        const inicio = parte * disciplinasPorParte
        const fim = Math.min(inicio + disciplinasPorParte, editalVerticalizado.disciplinas.length)
        const disciplinasParte = editalVerticalizado.disciplinas.slice(inicio, fim)
        
        console.log(`📋 [VesperaDeProvaConfig] Gerando parte ${parte + 1}/${totalPartes}: disciplinas ${inicio + 1} a ${fim}`)
        setGenerationStatus(`Gerando parte ${parte + 1}/${totalPartes} (${disciplinasParte.length} disciplinas)...`)
        
        // Preparar estrutura simplificada para a IA (apenas esta parte)
        const estrutura = {
          curso: courseName,
          concurso: concurso,
          banca: bancaExaminadora,
          disciplinas: disciplinasParte.map((disciplina, idx) => ({
            nome: disciplina.nome,
            questoes: questoesPorMateria[inicio + idx] || 5, // Usar quantidade configurada pelo usuário
            topicos: disciplina.topicos?.map(t => t.nome).join(', ') || ''
          }))
        }
        
        const prompt = `Você é um Analista de Concursos de Elite focado em aprovação policial.

CONTEXTO:
- Curso: ${estrutura.curso}
- Concurso: ${estrutura.concurso}
- Banca Examinadora: ${estrutura.banca}

ESTRUTURA DO EDITAL:
${JSON.stringify(estrutura.disciplinas, null, 2)}

INSTRUÇÕES:
Gere um material de revisão de "Véspera de Prova" para CADA disciplina na ordem exata acima. Para cada disciplina, inclua:

DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
IMPORTANTE: Use apenas informações atualizadas até esta data. Verifique se há leis, decretos ou regulamentos recentes que possam afetar o conteúdo.

**MODO HACKER DOS CONCURSOS**

1. **RAIO-X DE PROBABILIDADE**:
   - Top Assuntos Quentes: Gere entre 5 a 15 tópicos com maior probabilidade de cair NO CONCURSO ${estrutura.concurso} (quantidade depende da extensão do conteúdo da disciplina)
   - O Padrão da Banca: Como a banca ${estrutura.banca} costuma cobrar esta disciplina especificamente no concurso.

2. **REVISÃO TURBO**:
   - 5-7 resumos detalhados e explicativos (não apenas frases curtas). Cada resumo deve:
     * Explicar o conceito de forma clara e didática(NADA SUPERFICIAL, QUERO BEM COMPLETO)
     * Citar exemplos práticos do concurso ${estrutura.concurso}
     * Ser específico para o cargo de ${estrutura.curso}
     * Incluir dicas de memorização(nada gernérico e vazio/vago)
     * **USE FORMATAÇÃO RICA**: Use **negrito** para termos importantes, *itálico* para ênfase, e formatação visual para destacar pontos-chave
   - 3-4 pegadinhas ("Cuidado meu querido aluno!"):
     * Erros comuns que a banca ${estrutura.banca} costuma cobrar
     * Detalhes que passam despercebidos
     * Armadilhas específicas do concurso ${estrutura.concurso}
     * **USE FORMATAÇÃO RICA**: Use **negrito**, *itálico*, e destaque visual para armadilhas

3. **QUESTÕES PREDITIVAS**:
   - Gere EXATAMENTE ${estrutura.disciplinas.map(d => d.questoes).join(', ')} questões para cada disciplina
   - No estilo da banca ${estrutura.banca} (A, B, C, D, E ou Certo/Errado)
   - Contextualizadas com o concurso ${estrutura.concurso} e cargo ${estrutura.curso}
   - Gabarito Comentado: explique o porquê das outras estarem erradas
   - **USE FORMATAÇÃO RICA no gabarito**: Use **negrito** para resposta correta, *itálico* para explicações, e formatação visual para destacar pontos importantes
   - **NÃO ECONOMIZE TEXTO**: Seja detalhado e completo nas explicações, mas não excessivamente extenso

FORMATO JSON:
{
  "material": [
    {
      "disciplina": "nome da disciplina",
      "raioX": {
        "topAssuntos": ["assunto 1", "assunto 2", "assunto 3"],
        "padraoBanca": "descrição do padrão"
      },
      "revisaoTurbo": {
        "resumos": ["resumo detalhado 1", "resumo detalhado 2"],
        "pegadinhas": ["pegadinha 1"]
      },
      "questoes": [
        {
          "enunciado": "texto da questão",
          "alternativas": ["A", "B", "C", "D", "E"],
          "gabarito": "A",
          "comentario": "explicação detalhada"
        }
      ]
    }
  ]
}

REGRAS:
- Mantenha a ordem EXATA das disciplinas
- Use tom focado e direto
- Seja ESPECÍFICO do concurso ${estrutura.concurso} e cargo ${estrutura.curso}
- Cite o nome do concurso e cargo nos resumos e questões
- Retorne APENAS o JSON válido, sem texto adicional
- NÃO use caracteres de markdown (como **, *, •, __, ~~, \` etc.) nos textos`
      
      // Carregar múltiplas API keys do Gemini
      const apiKeys = []
      for (let i = 1; i <= 10; i++) {
        const key = import.meta.env[`VITE_GEMINI_API_KEY_${i}`] || import.meta.env[`VITE_GEMINI_API_KEY`]
        if (key && !apiKeys.includes(key)) {
          apiKeys.push(key)
        }
      }
      
      console.log('🔑 [VesperaDeProvaConfig] API Keys carregadas:', apiKeys.length)
      
      if (apiKeys.length === 0) {
        throw new Error('Nenhuma API key do Gemini encontrada')
      }
      
      setGenerationStatus('Enviando solicitação para a IA...')
      
      // Função para fazer requisição com rotação de API keys e retry para 503
      const fetchWithKeyRotation = async (url, options) => {
        const maxRetries = 3
        const baseDelay = 2000 // 2 segundos
        
        for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
          const apiKey = apiKeys[keyIndex]
          console.log(`🔑 [VesperaDeProvaConfig] Tentando API key ${keyIndex + 1}/${apiKeys.length}`)
          
          const urlWithKey = `${url}?key=${apiKey}`
          
          for (let retry = 0; retry < maxRetries; retry++) {
            try {
              const response = await fetch(urlWithKey, options)
              const data = await response.json()
              
              if (response.ok) {
                console.log(`✅ [VesperaDeProvaConfig] API key ${keyIndex + 1} funcionou`)
                return data
              }
              
              // Se for erro 429 (Too Many Requests), tentar próxima key
              if (response.status === 429) {
                console.log(`⚠️ [VesperaDeProvaConfig] API key ${keyIndex + 1} atingiu quota, tentando próxima...`)
                break
              }
              
              // Se for erro 503 (Service Unavailable), fazer retry com exponential backoff
              if (response.status === 503) {
                const delay = baseDelay * Math.pow(2, retry)
                console.log(`⚠️ [VesperaDeProvaConfig] API key ${keyIndex + 1} com alta demanda (503), retry ${retry + 1}/${maxRetries} em ${delay/1000}s...`)
                
                if (retry < maxRetries - 1) {
                  await new Promise(resolve => setTimeout(resolve, delay))
                  continue
                }
              }
              
              // Se for outro erro, lançar imediatamente
              console.error('❌ [VesperaDeProvaConfig] Erro na API Gemini:', data)
              throw new Error(data.error?.message || 'Erro na API da IA')
            } catch (error) {
              if (retry < maxRetries - 1 && error.message?.includes('high demand')) {
                const delay = baseDelay * Math.pow(2, retry)
                console.log(`⚠️ [VesperaDeProvaConfig] Retry ${retry + 1}/${maxRetries} em ${delay/1000}s...`)
                await new Promise(resolve => setTimeout(resolve, delay))
                continue
              }
              
              if (keyIndex < apiKeys.length - 1) {
                console.log(`⚠️ [VesperaDeProvaConfig] API key ${keyIndex + 1} falhou, tentando próxima...`)
                break
              }
              throw error
            }
          }
        }
        
        throw new Error('Todas as API keys atingiram quota ou falharam')
      }
      
      const data = await fetchWithKeyRotation(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        {
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
              maxOutputTokens: 32000,
            },
            tools: [
              {
                googleSearchRetrieval: {
                  dynamicRetrievalConfig: {
                    mode: "MODE_DYNAMIC",
                    dynamicThreshold: 0.7
                  }
                }
              }
            ]
          })
        }
      )
      
      setGenerationStatus('Processando resposta da IA...')
      
      setGenerationStatus('Analisando conteúdo gerado...')
      
      const generatedText = data.candidates[0]?.content?.parts[0]?.text
      
      if (!generatedText) {
        throw new Error('A IA não retornou nenhum conteúdo')
      }
      
      console.log('📝 [VesperaDeProvaConfig] Texto gerado, tamanho:', generatedText.length)
      
      // Extrair JSON (mesma abordagem do EditalVerticalizado)
      const materialStart = generatedText.indexOf('"material"')
      const arrayStart = generatedText.indexOf('[', materialStart)
      const arrayEnd = generatedText.lastIndexOf(']')
      
      if (materialStart === -1 || arrayStart === -1 || arrayEnd === -1) {
        console.error('❌ [VesperaDeProvaConfig] Não foi possível encontrar o array de material')
        console.error('❌ [VesperaDeProvaConfig] Texto gerado (primeiros 500 chars):', generatedText.substring(0, 500))
        throw new Error('Não foi possível encontrar o array de material na resposta')
      }
      
      const materialJson = '{"material":' + generatedText.substring(arrayStart, arrayEnd + 1) + '}'
      
      setGenerationStatus('Validando estrutura...')
      
      let materialData = null
      
      try {
        materialData = JSON.parse(materialJson)
        console.log('✅ [VesperaDeProvaConfig] JSON parseado com sucesso')
      } catch (parseError) {
        console.error('❌ [VesperaDeProvaConfig] Erro ao fazer parse do JSON:', parseError.message)
        
        // Tentar corrigir com múltiplas estratégias
        let fixedJson = materialJson
        
        // Correção 1: Remover caracteres de controle (bad control characters)
        fixedJson = fixedJson.replace(/[\x00-\x1F\x7F-\x9F]/g, '')
        
        // Correção 2: Remover vírgulas extras antes de } e ]
        fixedJson = fixedJson.replace(/,\s*}/g, '}')
        fixedJson = fixedJson.replace(/,\s*]/g, ']')
        
        // Correção 3: Remover quebras de linha extras
        fixedJson = fixedJson.replace(/\n\s*\}/g, '}')
        fixedJson = fixedJson.replace(/\n\s*\]/g, ']')
        
        // Correção 4: Tentar encontrar onde o JSON está incompleto e cortar
        const errorPosition = parseInt(parseError.message.match(/position (\d+)/)?.[1] || '0')
        if (errorPosition > 0) {
          console.log(`🔧 [VesperaDeProvaConfig] Erro na posição ${errorPosition}, tentando cortar...`)
          
          // Encontrar o último objeto completo antes do erro
          const beforeError = fixedJson.substring(0, errorPosition)
          
          // Tentar encontrar o último "}" que fecha um objeto
          const lastCompleteObject = beforeError.lastIndexOf('}')
          if (lastCompleteObject !== -1) {
            // Cortar até o último objeto completo
            fixedJson = fixedJson.substring(0, lastCompleteObject + 1)
            
            // Adicionar o fechamento do array e do objeto principal
            if (fixedJson.includes('"material":[')) {
              fixedJson = fixedJson + ']}'
            }
          }
        }
        
        // Correção 5: Se ainda falhar, tentar remover o último objeto incompleto
        if (errorPosition > 0) {
          // Encontrar o último objeto COMPLETO (com todos os campos obrigatórios)
          // Regex atualizado para permitir arrays vazios em alternativas
          const questoesPattern = /"enunciado":\s*"[^"]*",\s*"alternativas":\s*\[[^\]]*\],\s*"gabarito":\s*"[^"]*",\s*"comentario":\s*"[^"]*"/g
          const matches = fixedJson.match(questoesPattern)
          
          if (matches && matches.length > 0) {
            console.log(`🔧 [VesperaDeProvaConfig] Encontradas ${matches.length} questões completas`)
            
            // Encontrar a posição da última questão completa
            const lastCompleteMatch = matches[matches.length - 1]
            const lastCompleteIndex = fixedJson.lastIndexOf(lastCompleteMatch)
            
            if (lastCompleteIndex !== -1) {
              // Encontrar o fechamento do objeto após a última questão completa
              const afterLastComplete = fixedJson.substring(lastCompleteIndex)
              const closingBrace = afterLastComplete.indexOf('}')
              
              if (closingBrace !== -1) {
                const completeEnd = lastCompleteIndex + closingBrace
                fixedJson = fixedJson.substring(0, completeEnd + 1)
                
                // Adicionar o fechamento do array e do objeto principal
                if (fixedJson.includes('"material":[')) {
                  fixedJson = fixedJson + ']}'
                }
                
                console.log(`🔧 [VesperaDeProvaConfig] JSON corrigido removendo última questão incompleta`)
              }
            }
          } else {
            // Se não encontrar questões completas, tentar remover o último objeto
            const lastObjectEnd = fixedJson.lastIndexOf('},')
            if (lastObjectEnd !== -1) {
              console.log(`🔧 [VesperaDeProvaConfig] Removendo último objeto incompleto...`)
              fixedJson = fixedJson.substring(0, lastObjectEnd + 1)
              
              if (fixedJson.includes('"material":[')) {
                fixedJson = fixedJson + ']}'
              }
            }
          }
        }
        
        // Correção 6: Se ainda falhar, tentar uma abordagem mais agressiva
        if (errorPosition > 0) {
          // Encontrar o último "questoes": [ e remover tudo após o último objeto completo
          const questoesStart = fixedJson.lastIndexOf('"questoes":')
          if (questoesStart !== -1) {
            const afterQuestoes = fixedJson.substring(questoesStart)
            const arrayStart = afterQuestoes.indexOf('[')
            
            if (arrayStart !== -1) {
              // Encontrar todos os objetos completos no array
              const questoesArray = afterQuestoes.substring(arrayStart + 1)
              
              // Contar o número de objetos completos
              let braceCount = 0
              let lastCompletePos = -1
              
              for (let i = 0; i < questoesArray.length; i++) {
                if (questoesArray[i] === '{') braceCount++
                if (questoesArray[i] === '}') braceCount--
                
                if (braceCount === 0 && questoesArray[i] === '}') {
                  lastCompletePos = i
                }
              }
              
              if (lastCompletePos !== -1) {
                const completeEnd = questoesStart + arrayStart + 1 + lastCompletePos
                fixedJson = fixedJson.substring(0, completeEnd + 1)
                
                // Adicionar o fechamento do array e do objeto principal
                if (fixedJson.includes('"material":[')) {
                  fixedJson = fixedJson + ']}'
                }
                
                console.log(`🔧 [VesperaDeProvaConfig] JSON corrigido usando abordagem agressiva`)
              }
            }
          }
        }
        
        console.log(`🔧 [VesperaDeProvaConfig] JSON corrigido, tamanho: ${fixedJson.length}`)
        
        try {
          materialData = JSON.parse(fixedJson)
          console.log('✅ [VesperaDeProvaConfig] JSON corrigido e parseado')
          console.log(`✅ [VesperaDeProvaConfig] Disciplinas salvas: ${materialData.material?.length || 0}`)
        } catch (fixError) {
          console.error('❌ [VesperaDeProvaConfig] Falha ao corrigir JSON:', fixError.message)
          console.error('❌ [VesperaDeProvaConfig] Últimos 500 caracteres do JSON:', materialJson.slice(-500))
          throw new Error(`JSON inválido mesmo após correção: ${fixError.message}`)
        }
      }
      
      if (!materialData.material || !Array.isArray(materialData.material)) {
        console.error('❌ [VesperaDeProvaConfig] Estrutura recebida:', materialData)
        throw new Error('Formato inválido - esperado array em material')
      }
      
      console.log('✅ [VesperaDeProvaConfig] Material validado, total disciplinas:', materialData.material.length)
      
      // Adicionar disciplinas desta parte ao array total
      todasDisciplinas.push(...materialData.material)
      completedParts.add(parte)
      
      // Atualizar progresso visual
      const progressPercent = Math.round((completedParts.size / totalPartes) * 100)
      setGenerationProgress(progressPercent)
      
      console.log(`📦 [VesperaDeProvaConfig] Parte ${parte + 1} concluída, total disciplinas acumuladas: ${todasDisciplinas.length}`)
      console.log(`📊 [VesperaDeProvaConfig] Progresso: ${progressPercent}% (${completedParts.size}/${totalPartes} partes)`)
      
      // Salvar progresso e material parcial no Firestore
      const progressRef = doc(db, 'courses', courseId, 'vesperaDeProva', 'progress')
      await setDoc(progressRef, {
        config: {
          banca: bancaExaminadora,
          concurso: concurso,
          questoesPorMateria: questoesPorMateria
        },
        completedParts: Array.from(completedParts),
        totalParts: totalPartes,
        status: 'in_progress',
        material: todasDisciplinas,
        updatedAt: serverTimestamp()
      })
      
      // Salvar material parcial
      const materialRef = doc(db, 'courses', courseId, 'vesperaDeProva', 'material')
      await setDoc(materialRef, {
        material: todasDisciplinas,
        banca: bancaExaminadora,
        concurso: concurso,
        generatedAt: serverTimestamp(),
        generatedBy: user.uid,
        isPartial: true
      })
      
      console.log(`💾 [VesperaDeProvaConfig] Progresso e material parcial salvos`)
      setGenerationStatus(`Parte ${parte + 1}/${totalPartes} concluída (${progressPercent}%)`)
      }
      
      // Combinar todas as partes em um único material
      const materialCompleto = {
        material: todasDisciplinas
      }
      
      console.log('✅ [VesperaDeProvaConfig] Todas as partes geradas, total disciplinas:', materialCompleto.material.length)
      
      setGenerationStatus('Salvando material...')
      
      console.log('🔐 [VesperaDeProvaConfig] Verificando permissões antes de salvar...')
      console.log('🔐 [VesperaDeProvaConfig] Usuário autenticado:', !!user)
      console.log('🔐 [VesperaDeProvaConfig] Usuário UID:', user?.uid)
      console.log('🔐 [VesperaDeProvaConfig] É admin:', isAdmin)
      console.log('🔐 [VesperaDeProvaConfig] Course ID:', courseId)
      
      // Tentar salvar usando setDoc direto (mais simples)
      const materialRef = doc(db, 'courses', courseId, 'vesperaDeProva', 'material')
      
      console.log('📝 [VesperaDeProvaConfig] Caminho do documento:', `courses/${courseId}/vesperaDeProva/material`)
      console.log('📝 [VesperaDeProvaConfig] Tentando salvar com setDoc...')
      
      try {
        await setDoc(materialRef, {
          ...materialCompleto,
          banca: bancaExaminadora,
          concurso: concurso,
          generatedAt: serverTimestamp(),
          generatedBy: user.uid,
          isPartial: false
        })
        console.log('✅ [VesperaDeProvaConfig] Material salvo no Firestore com setDoc')
        
        // Marcar progresso como completo
        const progressRef = doc(db, 'courses', courseId, 'vesperaDeProva', 'progress')
        await setDoc(progressRef, {
          config: {
            banca: bancaExaminadora,
            concurso: concurso,
            questoesPorMateria: questoesPorMateria
          },
          completedParts: Array.from(completedParts),
          totalParts: totalPartes,
          status: 'completed',
          material: todasDisciplinas,
          updatedAt: serverTimestamp()
        })
        
        console.log('✅ [VesperaDeProvaConfig] Progresso marcado como completo')
        setGenerationProgress(100)
      } catch (setDocError) {
        console.error('❌ [VesperaDeProvaConfig] Erro ao salvar com setDoc:', setDocError)
        
        // Se falhar, tentar salvar em um caminho diferente
        console.log('🔄 [VesperaDeProvaConfig] Tentando salvar em caminho alternativo...')
        const altRef = doc(db, 'vesperaDeProvaMaterials', courseId)
        
        try {
          await setDoc(altRef, {
            ...materialCompleto,
            banca: bancaExaminadora,
            concurso: concurso,
            courseId: courseId,
            generatedAt: serverTimestamp(),
            generatedBy: user.uid,
          })
          console.log('✅ [VesperaDeProvaConfig] Material salvo no Firestore em caminho alternativo')
        } catch (altError) {
          console.error('❌ [VesperaDeProvaConfig] Erro ao salvar em caminho alternativo:', altError)
          throw new Error(`Não foi possível salvar o material: ${altError.message}`)
        }
      }
      
      setGenerationStatus('✅ Material gerado com sucesso!')
      
      setTimeout(() => {
        navigate(`/vespera-de-prova?course=${courseId}`)
      }, 2000)
      
    } catch (error) {
      console.error('❌ [VesperaDeProvaConfig] Erro ao gerar material:', error)
      console.error('❌ [VesperaDeProvaConfig] Código:', error.code)
      console.error('❌ [VesperaDeProvaConfig] Mensagem:', error.message)
      setGenerationStatus(`❌ Erro: ${error.message}`)
    } finally {
      setGenerating(false)
    }
  }
  
  if (!isAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">
            Acesso Restrito
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Apenas administradores podem acessar esta página.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-alego-600 text-white rounded-lg hover:bg-alego-700 transition"
          >
            Voltar ao Dashboard
          </button>
        </div>
      </div>
    )
  }
  
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-alego-600 border-t-transparent"></div>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Carregando...</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(`/vespera-de-prova?course=${courseId}`)}
            className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 mb-4 transition-colors"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Voltar
          </button>
          
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-3">
            <SparklesIcon className="h-8 w-8 text-alego-600" />
            Configurar Véspera de Prova
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            {courseName} - {concurso || 'Concurso não definido'}
          </p>
        </div>
        
        {/* Formulário de Configuração */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8">
          <div className="space-y-8">
            {/* Banca Examinadora */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                📝 Banca Examinadora
              </label>
              <input
                type="text"
                value={bancaExaminadora}
                onChange={(e) => setBancaExaminadora(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 p-3 text-sm dark:bg-slate-700 dark:text-slate-100 focus:ring-2 focus:ring-alego-500 focus:border-transparent"
                placeholder="Ex: Cebraspe, FCC, Vunesp"
              />
            </div>
            
            {/* Concurso */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Concurso *
              </label>
              <input
                type="text"
                value={concurso}
                onChange={(e) => setConcurso(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 p-3 text-sm dark:bg-slate-700 dark:text-slate-100 focus:ring-2 focus:ring-alego-500 focus:border-transparent"
                placeholder="Ex: PM AL 2024"
              />
            </div>
            
            {/* Questões por matéria */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
                Questões por Matéria
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {editalVerticalizado?.disciplinas?.map((disciplina, idx) => (
                  <div key={idx} className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                    <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      {disciplina.nome}
                    </span>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={questoesPorMateria[idx] || 5}
                      onChange={(e) => setQuestoesPorMateria({
                        ...questoesPorMateria,
                        [idx]: parseInt(e.target.value) || 5
                      })}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 p-2 text-sm text-center dark:bg-slate-600 dark:text-slate-100 focus:ring-2 focus:ring-alego-500 focus:border-transparent"
                    />
                  </div>
                ))}
              </div>
            </div>
            
            {/* Status de geração */}
            {generating && (
              <div className="bg-slate-100 dark:bg-slate-700 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  <ArrowPathIcon className="h-6 w-6 text-alego-600 animate-spin" />
                  <span className="text-base text-slate-700 dark:text-slate-300">
                    {generationStatus}
                  </span>
                </div>
                
                {/* Barra de progresso */}
                {generationProgress > 0 && (
                  <div className="mt-4">
                    <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400 mb-2">
                      <span>Progresso</span>
                      <span>{generationProgress}%</span>
                    </div>
                    <div className="w-full bg-slate-300 dark:bg-slate-600 rounded-full h-3">
                      <div
                        className="bg-alego-600 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${generationProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Progresso existente */}
            {existingProgress && existingProgress.status === 'in_progress' && !generating && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
                <div className="flex items-start gap-3">
                  <SparklesIcon className="h-6 w-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">
                      Geração em andamento detectada
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                      Foi encontrada uma geração anterior com as mesmas configurações que não foi concluída. 
                      {existingProgress.completedParts?.length || 0} de {existingProgress.totalParts || 0} partes foram geradas.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={generateMaterial}
                        className="px-4 py-2 bg-alego-600 text-white rounded-lg text-sm font-medium hover:bg-alego-700 transition"
                      >
                        Continuar Geração
                      </button>
                      <button
                        onClick={async () => {
                          if (confirm('Tem certeza que deseja limpar o progresso e iniciar uma nova geração?')) {
                            try {
                              const progressRef = doc(db, 'courses', courseId, 'vesperaDeProva', 'progress')
                              await setDoc(progressRef, {})
                              setExistingProgress(null)
                              alert('Progresso limpo com sucesso.')
                            } catch (error) {
                              alert('Erro ao limpar progresso: ' + error.message)
                            }
                          }
                        }}
                        className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                      >
                        Limpar Progresso
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Botões */}
            <div className="flex gap-4 pt-4">
              <button
                onClick={() => navigate(`/vespera-de-prova?course=${courseId}`)}
                className="flex-1 px-6 py-3 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={generateMaterial}
                disabled={generating}
                className="flex-1 px-6 py-3 bg-alego-600 text-white rounded-lg font-medium hover:bg-alego-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
              >
                {generating ? (
                  <>
                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <SparklesIcon className="h-5 w-5" />
                    Gerar Material
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default VesperaDeProvaConfig
