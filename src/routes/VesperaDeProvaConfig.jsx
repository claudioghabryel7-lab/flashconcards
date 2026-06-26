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
  CheckIcon,
  TrashIcon,
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
  
  // Banca do curso (já configurada)
  const [bancaExaminadora, setBancaExaminadora] = useState('')
  const [concurso, setConcurso] = useState('')
  
  // Status de cada matéria (gerado/não gerado)
  const [materiasStatus, setMateriasStatus] = useState({})
  
  // Configurações de questões por matéria
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
        
        // Carregar nome do curso e banca
        const courseDoc = await getDoc(doc(db, 'courses', courseId))
        if (courseDoc.exists()) {
          const data = courseDoc.data()
          setCourseName(data.name || data.competition || '')
          setConcurso(data.competition || '')
          setBancaExaminadora(data.banca || '') // Usar banca configurada no curso
          console.log('✅ [VesperaDeProvaConfig] Curso carregado:', data.name)
          console.log('✅ [VesperaDeProvaConfig] Banca:', data.banca)
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
          const initialStatus = {}
          editalData.disciplinas?.forEach((disciplina, idx) => {
            initialQuestoes[idx] = 5
            initialStatus[idx] = 'pending' // pending, generating, completed, error
          })
          setQuestoesPorMateria(initialQuestoes)
          setMateriasStatus(initialStatus)
          
          // Carregar status das matérias já geradas
          try {
            const materialRef = doc(db, 'courses', courseId, 'vesperaDeProva', 'material')
            const materialDoc = await getDoc(materialRef)
            if (materialDoc.exists()) {
              const materialData = materialDoc.data()
              if (materialData.material && Array.isArray(materialData.material)) {
                const updatedStatus = { ...initialStatus }
                materialData.material.forEach((item) => {
                  // Encontrar o índice da disciplina pelo nome
                  const idx = editalData.disciplinas?.findIndex(d => d.nome === item.disciplina)
                  if (idx !== -1) {
                    updatedStatus[idx] = 'completed'
                  }
                })
                setMateriasStatus(updatedStatus)
                console.log('✅ [VesperaDeProvaConfig] Status das matérias carregado')
              }
            }
          } catch (error) {
            console.log('ℹ️ [VesperaDeProvaConfig] Nenhum material existente encontrado')
          }
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
  }, [courseId, user, isAdmin])
  
  // Apagar conteúdo de uma matéria
  const deleteMaterial = async (disciplinaIdx) => {
    if (!isAdmin) {
      alert('Apenas administradores podem apagar material.')
      return
    }
    
    if (!user) {
      alert('Você precisa estar autenticado para apagar material.')
      return
    }
    
    const disciplina = editalVerticalizado?.disciplinas[disciplinaIdx]
    if (!disciplina) {
      alert('Disciplina não encontrada.')
      return
    }
    
    if (!confirm(`Tem certeza que deseja apagar o conteúdo de "${disciplina.nome}"?`)) {
      return
    }
    
    try {
      console.log('🗑️ [VesperaDeProvaConfig] Apagando material:', disciplina.nome)
      
      const materialRef = doc(db, 'courses', courseId, 'vesperaDeProva', 'material')
      const materialDoc = await getDoc(materialRef)
      
      if (materialDoc.exists()) {
        const materialData = materialDoc.data()
        const existingMaterial = materialData.material || []
        
        // Remover a disciplina do array
        const updatedMaterial = existingMaterial.filter(m => m.disciplina !== disciplina.nome)
        
        if (updatedMaterial.length === 0) {
          // Se não houver mais matérias, apagar o documento inteiro
          const { deleteDoc } = await import('firebase/firestore')
          await deleteDoc(materialRef)
          console.log('✅ [VesperaDeProvaConfig] Documento apagado (sem mais matérias)')
        } else {
          // Atualizar com o array sem a disciplina removida
          await setDoc(materialRef, {
            material: updatedMaterial,
            banca: bancaExaminadora,
            concurso: concurso,
            generatedAt: serverTimestamp(),
            generatedBy: user.uid,
          })
          console.log('✅ [VesperaDeProvaConfig] Matéria removida do material')
        }
        
        // Atualizar status
        setMateriasStatus(prev => ({ ...prev, [disciplinaIdx]: 'pending' }))
        alert(`Conteúdo de "${disciplina.nome}" apagado com sucesso!`)
      }
    } catch (error) {
      console.error('❌ [VesperaDeProvaConfig] Erro ao apagar material:', error)
      alert('Erro ao apagar material: ' + error.message)
    }
  }
  
  // Regenerar conteúdo de uma matéria (apaga anterior e gera novo)
  const regenerateMaterial = async (disciplinaIdx) => {
    if (!isAdmin) {
      alert('Apenas administradores podem regenerar material.')
      return
    }
    
    if (!user) {
      alert('Você precisa estar autenticado para regenerar material.')
      return
    }
    
    const disciplina = editalVerticalizado?.disciplinas[disciplinaIdx]
    if (!disciplina) {
      alert('Disciplina não encontrada.')
      return
    }
    
    if (!confirm(`Tem certeza que deseja regenerar o conteúdo de "${disciplina.nome}"? O conteúdo anterior será apagado.`)) {
      return
    }
    
    // Primeiro apagar o conteúdo anterior
    await deleteMaterial(disciplinaIdx)
    
    // Depois gerar o novo
    await generateSingleMaterial(disciplinaIdx)
  }
  
  // Gerar material de uma única matéria
  const generateSingleMaterial = async (disciplinaIdx) => {
    if (!isAdmin) {
      alert('Apenas administradores podem gerar material de Véspera de Prova.')
      return
    }
    
    if (!user) {
      alert('Você precisa estar autenticado para gerar material.')
      return
    }
    
    if (!editalVerticalizado?.disciplinas) {
      alert('Edital verticalizado não encontrado.')
      return
    }
    
    const disciplina = editalVerticalizado.disciplinas[disciplinaIdx]
    if (!disciplina) {
      alert('Disciplina não encontrada.')
      return
    }
    
    setGenerating(true)
    setMateriasStatus(prev => ({ ...prev, [disciplinaIdx]: 'generating' }))
    setGenerationStatus(`Gerando conteúdo para ${disciplina.nome}...`)
    
    try {
      console.log('� [VesperaDeProvaConfig] Iniciando geração de matéria:', disciplina.nome)
      console.log('� [VesperaDeProvaConfig] Curso:', courseName)
      console.log('� [VesperaDeProvaConfig] Concurso:', concurso)
      console.log('� [VesperaDeProvaConfig] Banca:', bancaExaminadora)
      console.log('🚀 [VesperaDeProvaConfig] Questões:', questoesPorMateria[disciplinaIdx] || 5)
      
      const estrutura = {
        curso: courseName,
        concurso: concurso,
        banca: bancaExaminadora,
        disciplina: {
          nome: disciplina.nome,
          questoes: questoesPorMateria[disciplinaIdx] || 5,
          topicos: disciplina.topicos?.map(t => t.nome).join(', ') || ''
        }
      }
      
      const prompt = `Você é um Analista de Concursos de Elite focado em aprovação policial.

CONTEXTO:
- Curso: ${estrutura.curso}
- Concurso: ${estrutura.concurso}
- Banca Examinadora: ${estrutura.banca}
- Disciplina: ${estrutura.disciplina.nome}
- Quantidade de Questões: ${estrutura.disciplina.questoes}
- Tópicos: ${estrutura.disciplina.topicos}

INSTRUÇÕES:
Gere um material de revisão de "Véspera de Prova" para a disciplina ${estrutura.disciplina.nome}. Inclua:

🔍 VERIFICAÇÃO DE FONTES - OBRIGATÓRIO:
- Para CADA lei, decreto ou norma jurídica mencionada, VERIFIQUE a atualidade usando as ferramentas disponíveis
- Para CADA jurisprudência citada, VERIFIQUE se está vigente e atualizada
- Use as ferramentas de Function Calling para buscar em APIs oficiais (Senado, Datajud/CNJ)
- Sempre busque de fontes confiáveis: TJ,STF,LEI(E SUAS ATUALIZAÇÕES, NÃO PEGUE NADA ANTIGO OU DESATUALIZADO), GRAN CURSOS, QCONCURSOS, CONTEÚDOS JURÍDICOS, SITES DO PLANALTO, ENTENDIMENTOS ETC EM MATÉRIAS DE DIREITO... O FOCO É SEMPRE SER ATUALIZADO!
 Atualizações até o ano de agora ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })} até o exato momento
Sempre verifique atualizações de acordo com a data hora em ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })} , nunca dê conteúdo desatualizado... sempre atualizado. Verifique a veracidade da fonte em useGoogleSearch.
DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
IMPORTANTE: Use apenas informações atualizadas até esta data. Verifique se há leis, decretos ou regulamentos recentes que possam afetar o conteúdo.

🚨 PROIBIÇÃO ABSOLUTA DE ALUCINAÇÃO DE LEIS: É expressamente proibido inventar, supor ou criar números de leis, decretos ou emendas (especialmente com o ano corrente de 2026). Toda e qualquer lei citada deve ser um fato histórico real e amplamente consolidado. Na dúvida sobre o número exato da alteração, cite apenas o artigo principal da lei base (ex: 'conforme o Artigo 19 da Lei nº 11.340/2006') em vez de inventar uma lei modificadora.

**MODO HACKER DOS CONCURSOS**

1. **RAIO-X DE PROBABILIDADE**:
   - Top Assuntos Quentes: Gere entre 5 a 15 tópicos com maior probabilidade de cair NO CONCURSO ${estrutura.concurso} (quantidade depende da extensão do conteúdo da disciplina)
   - O Padrão da Banca: Como a banca ${estrutura.banca} costuma cobrar esta disciplina especificamente no concurso.

2. **REVISÃO TURBO**:
   - 🚨 OBRIGATÓRIO: Gere UM RESUMO para CADA UM dos "Top Assuntos Quentes" listados no Raio-X de Probabilidade
   - Se houver 5 top assuntos quentes, gere 5 resumos (um para cada)
   - Se houver 10 top assuntos quentes, gere 10 resumos (um para cada)
   - Cada resumo deve corresponder EXATAMENTE a um dos top assuntos quentes listados
   - NÃO PULE nenhum top assunto quente - todos devem ter seu resumo.
   - Cada resumo deve:
     * Explicar o conceito de forma clara e didática (NADA SUPERFICIAL, QUERO BEM COMPLETO)
     * Citar exemplos práticos do concurso ${estrutura.concurso}
     * Ser específico para o cargo de ${estrutura.curso}
     * Incluir dicas de memorização (nada genérico e vazio/vago)
     * Use texto limpo sem markdown (apenas tags HTML simples como <b> e <i> se necessário)
   - 3-4 pegadinhas ("Cuidado meu querido aluno!"):
     * Erros comuns que a banca ${estrutura.banca} costuma cobrar
     * Detalhes que passam despercebidos
     * Armadilhas específicas do concurso ${estrutura.concurso}
     * Use texto limpo sem markdown (apenas tags HTML simples como <b> e <i> se necessário)

3. **QUESTÕES PREDITIVAS**:
   - Gere EXATAMENTE ${estrutura.disciplina.questoes} questões
   - No estilo da banca ${estrutura.banca} (A, B, C, D, E ou Certo/Errado)
   - Contextualizadas com o concurso ${estrutura.concurso} e cargo ${estrutura.curso}
   - Gabarito Comentado: explique o porquê das outras estarem erradas
   - Use texto limpo sem markdown (apenas tags HTML simples como <b> e <i> se necessário)
   - Seja detalhado e completo nas explicações

🚨 INSTRUÇÃO CRÍTICA - CONTEÚDO ATUALIZADO:
VOCÊ ESTÁ GERANDO CONTEÚDO AGORA, NA DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
- PENSE: "Vou gerar agora de acordo com atualizações verídicas da data atual (${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })})"
- USE APENAS INFORMAÇÕES ATUALIZADAS E VIGENTES ATÉ ESTA DATA
- VERIFIQUE SE HOUVE ALTERAÇÕES RECENTES NAS LEIS, DECRETOS OU NORMAS
- NÃO USE INFORMAÇÕES DESATUALIZADAS OU REVOGADAS
- CITE SEMPRE A DATA DE ATUALIZAÇÃO QUANDO NECESSÁRIO

📅 CRONOLOGIA TEMPORAL OBRIGATÓRIA:
- Para CADA lei, decreto ou norma mencionada no conteúdo, você DEVE traçar uma cronologia desde sua criação até a data atual
- Exemplo: "Lei X, criada em 01/01/2000, alterada em 15/03/2010 pela Lei Y, modificada em 20/06/2015 pelo Decreto Z, atualizada em 10/02/2020 pela Medida Provisória W, vigente até ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}"
- Liste TODAS as alterações relevantes: leis, decretos, medidas provisórias, emendas constitucionais, súmulas, jurisprudências
- Sempre indique a data de cada alteração e o instrumento que a causou
- Se a lei foi revogada, indique a data de revogação e o instrumento que a revogou
- Mantenha o conteúdo atualizado considerando TODAS as alterações até a data atual

🚨 TRAVAS DE SEGURANÇA E FIDELIDADE JURÍDICA ABSOLUTA:

1. PROIBIÇÃO DE ALUCINAÇÃO LEGISLATIVA:
- Você está terminantemente proibido de inventar, supor ou estimar números de leis, decretos ou datas. Se não houver registro histórico exato e pacificado no ordenamento jurídico brasileiro de uma alteração, você NÃO deve mencioná-la.
- Nenhuma alteração futura hipotética deve ser criada. Toda e qualquer norma citada deve ter como lastro o portal do Planalto (Legislação Federal) ou os repositórios oficiais do STF/STJ.

2. FILTRO DE CONSTITUCIONALIDADE E RECEPÇÃO (CF/88):
- Para cada artigo ou código anterior a 1988 (como o CPP de 1941 ou o CP de 1940), você DEVE verificar se o dispositivo foi RECECIONADO ou NÃO pela Constituição Federal de 1988.
- É terminantemente proibido indicar como aplicável ou vigente um dispositivo legal que os Tribunais Superiores (STF/STJ) já declararam como não-recepcionado ou inconstitucional (Ex: Incomunicabilidade do preso do Art. 21 do CPP, prisão por dívida de depositário infiel, etc.). Você deve apontar o dispositivo e declarar imediatamente a sua ineficácia jurídica atual por incompatibilidade constitucional.

3. ALINHAMENTO OBRIGATÓRIO DE JURISPRUDÊNCIA PACIFICADA (STF/STJ):
- Toda análise legal deve confrontar a "letra fria da lei" com o entendimento atualizado das Súmulas Vinculantes, Súmulas do STF/STJ e os julgamentos de repercussão geral ou controle concentrado (ADIs, ADC, ADPFs).
- Se a eficácia de um artigo foi alterada, suspensa ou modelada por decisão definitiva do STF (como ocorreu no arquivamento do Art. 28 do CPP e no Juiz das Garantias), o texto DEVE refletir o procedimento determinado pelo Tribunal, e não a redação literal suspensa ou defasada que consta no código.

🧠 CHAIN OF THOUGHT COM AUTO-REFUTAÇÃO EMBUTIDA - OBRIGATÓRIO

[PROCESSO DE PENSAMENTO INTERNO - NÃO EXIBA ISSO NA SAÍDA FINAL]
Para cada conteúdo que você criar, você DEVE seguir OBRIGATORIAMENTE este processo de pensamento interno ANTES de gerar o conteúdo:

1. FAÇA UM RASCUNHO MENTAL dos pontos principais da lei/norma solicitada
2. QUESTIONE-SE RIGOROSAMENTE: "Estou inventando algum número de lei para os anos de 2025/2026? Estou inventando algum artigo que não existe no código/norma?"
3. SE PERCEBER QUE ESTÁ PRESTES A CITAR UM NÚMERO DE LEI FICTÍCIO para conceitos reais, PARE, REMOVA o número inventado e cite apenas o conceito doutrinário/jurisprudencial correto ou mencione que está em debate/reforma legislativa real, SEM INVENTAR DADOS
4. GARANTA QUE NÃO OMITIU alterações reais e históricas importantes
5. VERIFIQUE: "Esta lei/artigo foi recepcionado pela CF/88? Foi declarado inconstitucional pelo STF?"
6. VERIFIQUE: "A jurisprudência citada está atualizada? Houve alguma decisão recente do STF/STJ que alterou o entendimento?"
7. AUDITE-SE: "Todas as datas e números de leis citados são historicamente exatos e verificáveis?"

SÓ DEPOIS DE CONCLUIR ESTE PROCESSO DE VERIFICAÇÃO INTERNA, PROSSIGA PARA A GERAÇÃO DO CONTEÚDO.

[DIRETRIZES DE SAÍDA - O QUE EXIBIR]
Gere conteúdo de véspera de prova com:
- Raio-X de Probabilidade específico
- Revisão Turbo com cronologia real e precisa
- Pegadinhas reais da banca
- Questões preditivas fundamentadas estritamente na lei real vigente
- Se você não tiver certeza absoluta de um número de lei recente, cite o conceito técnico sem inventar o número do decreto

FORMATO JSON:
{
  "validacaoArtigo": "Artigo, lei ou jurisprudência específica citada (texto literal com fonte)",
  "disciplina": "${estrutura.disciplina.nome}",
  "dataGeracao": "${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}",
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
      "analiseJuridicaPrevia": "Artigo, lei ou jurisprudência específica citada (texto literal com fonte)",
      "enunciado": "texto da questão",
      "alternativas": ["A", "B", "C", "D", "E"],
      "gabarito": "A",
      "comentario": "explicação detalhada"
    }
  ]
}

⚠️ OBRIGATÓRIO: Inclua a data e hora atual no campo "dataGeracao" no formato DD/MM/AAAA HH:MM. Isso força a IA a gerar conteúdo atualizado.

REGRAS:
- Use tom focado e direto
- Seja ESPECÍFICO do concurso ${estrutura.concurso} e cargo ${estrutura.curso}
- Cite o nome do concurso e cargo nos resumos e questões
- Preencha "validacaoArtigo" e "analiseJuridicaPrevia" PRIMEIRO com o artigo/lei/jurisprudência literal antes de escrever o conteúdo
- Retorne APENAS o JSON válido, sem texto adicional
- Use texto limpo sem markdown (apenas tags HTML simples como <b> e <i> se necessário)`

      // Carregar múltiplas API keys do Gemini (priorizando VITE_GEMINI_API_KEY)
      const apiKeys = []
      
      // Primeiro tenta a key principal
      const mainKey = import.meta.env.VITE_GEMINI_API_KEY
      if (mainKey) {
        apiKeys.push(mainKey)
      }
      
      // Depois tenta numbered keys (apenas se a principal não existir ou para backup)
      for (let i = 1; i <= 10; i++) {
        const key = import.meta.env[`VITE_GEMINI_API_KEY_${i}`]
        if (key && !apiKeys.includes(key)) {
          apiKeys.push(key)
        }
      }
      
      console.log('🔑 [VesperaDeProvaConfig] API Keys carregadas:', apiKeys.length)
      
      if (apiKeys.length === 0) {
        throw new Error('Nenhuma API key do Gemini encontrada')
      }
      
      setGenerationStatus('Enviando solicitação para a IA...')
      
      // Modelos Gemini 2.5 para fallback
      const models = ['gemini-2.5-flash', 'gemini-2.5-pro']
      
      // Função para fazer requisição com rotação de API keys, retry e fallback de modelos
      const fetchWithFallback = async (prompt) => {
        const maxRetries = 3
        const baseDelay = 2000 // 2 segundos
        
        for (const model of models) {
          console.log(`🔄 [VesperaDeProvaConfig] Tentando modelo: ${model}`)
          
          for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
            const apiKey = apiKeys[keyIndex]
            console.log(`🔑 [VesperaDeProvaConfig] Tentando API key ${keyIndex + 1}/${apiKeys.length} com modelo ${model}`)
            
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
            
            for (let retry = 0; retry < maxRetries; retry++) {
              try {
                const response = await fetch(url, {
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
                    tools: [{
                      googleSearch: {}
                    }]
                  })
                })
                
                const data = await response.json()
                
                if (response.ok) {
                  console.log(`✅ [VesperaDeProvaConfig] Sucesso com modelo ${model} e API key ${keyIndex + 1}`)
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
                  console.log(`⚠️ [VesperaDeProvaConfig] Modelo ${model} com API key ${keyIndex + 1} com alta demanda (503), retry ${retry + 1}/${maxRetries} em ${delay/1000}s...`)
                  
                  if (retry < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay))
                    continue
                  }
                }
                
                // Se for outro erro, tentar próximo modelo
                console.error('❌ [VesperaDeProvaConfig] Erro na API Gemini:', data)
                break
              } catch (error) {
                if (retry < maxRetries - 1 && error.message?.includes('high demand')) {
                  const delay = baseDelay * Math.pow(2, retry)
                  console.log(`⚠️ [VesperaDeProvaConfig] Retry ${retry + 1}/${maxRetries} em ${delay/1000}s...`)
                  await new Promise(resolve => setTimeout(resolve, delay))
                  continue
                }
                
                console.log(`⚠️ [VesperaDeProvaConfig] API key ${keyIndex + 1} falhou, tentando próxima...`)
                break
              }
            }
          }
        }
        
        throw new Error('Todos os modelos e API keys falharam')
      }
      
      const data = await fetchWithFallback(prompt)
      
      setGenerationStatus('Processando resposta da IA...')
      
      const generatedText = data.candidates[0]?.content?.parts[0]?.text
      
      if (!generatedText) {
        throw new Error('A IA não retornou nenhum conteúdo')
      }
      
      console.log('📝 [VesperaDeProvaConfig] Texto gerado, tamanho:', generatedText.length)
      
      // Parsear JSON
      let materialData = null
      try {
        materialData = JSON.parse(generatedText)
        console.log('✅ [VesperaDeProvaConfig] JSON parseado com sucesso')
      } catch (parseError) {
        console.error('❌ [VesperaDeProvaConfig] Erro ao fazer parse do JSON:', parseError.message)
        
        // Tentar corrigir JSON
        let fixedJson = generatedText
        fixedJson = fixedJson.replace(/[\x00-\x1F\x7F-\x9F]/g, '')
        fixedJson = fixedJson.replace(/[\u2028\u2029\u200B\u200C\u200D\uFEFF]/g, '')
        fixedJson = fixedJson.replace(/\r\n/g, '\n')
        fixedJson = fixedJson.replace(/\r/g, '\n')
        fixedJson = fixedJson.replace(/,\s*}/g, '}')
        fixedJson = fixedJson.replace(/,\s*]/g, ']')
        
        try {
          materialData = JSON.parse(fixedJson)
          console.log('✅ [VesperaDeProvaConfig] JSON corrigido e parseado')
        } catch (fixError) {
          console.error('❌ [VesperaDeProvaConfig] Falha ao corrigir JSON:', fixError.message)
          throw new Error(`JSON inválido: ${fixError.message}`)
        }
      }
      
      // Salvar no Firestore (adicionar ao material existente ou criar novo)
      setGenerationStatus('Salvando material...')
      
      const materialRef = doc(db, 'courses', courseId, 'vesperaDeProva', 'material')
      const materialDoc = await getDoc(materialRef)
      
      let existingMaterial = []
      if (materialDoc.exists()) {
        const materialData = materialDoc.data()
        existingMaterial = materialData.material || []
      }
      
      // Verificar se a disciplina já existe e atualizar, ou adicionar nova
      const existingIndex = existingMaterial.findIndex(m => m.disciplina === materialData.disciplina)
      if (existingIndex !== -1) {
        existingMaterial[existingIndex] = materialData
      } else {
        existingMaterial.push(materialData)
      }
      
      await setDoc(materialRef, {
        material: existingMaterial,
        banca: bancaExaminadora,
        concurso: concurso,
        generatedAt: serverTimestamp(),
        generatedBy: user.uid,
      })
      
      console.log('✅ [VesperaDeProvaConfig] Material salvo com sucesso')
      
      // Atualizar status
      setMateriasStatus(prev => ({ ...prev, [disciplinaIdx]: 'completed' }))
      setGenerationStatus(`✅ ${disciplina.nome} gerado com sucesso!`)
      
      setTimeout(() => {
        setGenerationStatus('')
      }, 2000)
      
    } catch (error) {
      console.error('❌ [VesperaDeProvaConfig] Erro ao gerar material:', error)
      setMateriasStatus(prev => ({ ...prev, [disciplinaIdx]: 'error' }))
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
            {/* Informações do curso */}
            <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Informações do Curso
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Curso:</span>
                  <span className="text-slate-900 dark:text-slate-100 font-medium">{courseName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Concurso:</span>
                  <span className="text-slate-900 dark:text-slate-100 font-medium">{concurso || 'Não definido'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Banca:</span>
                  <span className="text-slate-900 dark:text-slate-100 font-medium">{bancaExaminadora || 'Não definida'}</span>
                </div>
              </div>
            </div>
            
            {/* Lista de matérias */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
                Matérias do Edital
              </label>
              <div className="space-y-3">
                {editalVerticalizado?.disciplinas?.map((disciplina, idx) => {
                  const status = materiasStatus[idx] || 'pending'
                  const statusColors = {
                    pending: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
                    generating: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
                    completed: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
                    error: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                  }
                  const statusText = {
                    pending: 'Pendente',
                    generating: 'Gerando...',
                    completed: 'Gerado',
                    error: 'Erro'
                  }
                  
                  return (
                    <div key={idx} className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            {disciplina.nome}
                          </span>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-slate-600 dark:text-slate-400">Questões:</label>
                              <input
                                type="number"
                                min="1"
                                max="20"
                                value={questoesPorMateria[idx] || 5}
                                onChange={(e) => setQuestoesPorMateria({
                                  ...questoesPorMateria,
                                  [idx]: parseInt(e.target.value) || 5
                                })}
                                disabled={status === 'generating'}
                                className="w-16 rounded border border-slate-300 dark:border-slate-600 p-1 text-xs text-center dark:bg-slate-600 dark:text-slate-100 focus:ring-2 focus:ring-alego-500 focus:border-transparent disabled:opacity-50"
                              />
                            </div>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[status]}`}>
                              {statusText[status]}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {status === 'completed' && (
                            <>
                              <button
                                onClick={() => regenerateMaterial(idx)}
                                disabled={generating}
                                className="px-3 py-2 bg-yellow-600 text-white rounded-lg text-sm font-medium hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
                                title="Regenerar (apaga anterior e gera novo)"
                              >
                                <ArrowPathIcon className="h-4 w-4" />
                                Regenerar
                              </button>
                              <button
                                onClick={() => deleteMaterial(idx)}
                                disabled={generating}
                                className="px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
                                title="Apagar conteúdo"
                              >
                                <TrashIcon className="h-4 w-4" />
                                Apagar
                              </button>
                            </>
                          )}
                          {status !== 'completed' && (
                            <button
                              onClick={() => generateSingleMaterial(idx)}
                              disabled={status === 'generating'}
                              className="px-4 py-2 bg-alego-600 text-white rounded-lg text-sm font-medium hover:bg-alego-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
                            >
                              {status === 'generating' ? (
                                <>
                                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                  Gerando...
                                </>
                              ) : (
                                <>
                                  <SparklesIcon className="h-4 w-4" />
                                  Gerar
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            
            {/* Status de geração */}
            {generating && (
              <div className="bg-slate-100 dark:bg-slate-700 rounded-lg p-6">
                <div className="flex items-center gap-3">
                  <ArrowPathIcon className="h-6 w-6 text-alego-600 animate-spin" />
                  <span className="text-base text-slate-700 dark:text-slate-300">
                    {generationStatus}
                  </span>
                </div>
              </div>
            )}
            
            {/* Botão para ver resultado */}
            <div className="flex gap-4 pt-4">
              <button
                onClick={() => navigate(`/vespera-de-prova?course=${courseId}`)}
                className="flex-1 px-6 py-3 bg-alego-600 text-white rounded-lg font-medium hover:bg-alego-700 transition flex items-center justify-center gap-2"
              >
                <ArrowLeftIcon className="h-5 w-5" />
                Ver Véspera de Prova
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default VesperaDeProvaConfig
