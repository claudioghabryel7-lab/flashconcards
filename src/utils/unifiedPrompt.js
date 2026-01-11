/**
 * Utilitário para buscar e construir prompts unificados por curso
 */

import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'

/**
 * Busca o prompt unificado de um curso
 * @param {string} courseId - ID do curso
 * @returns {Promise<{banca: string, concursoName: string, prompt: string} | null>}
 */
export async function getUnifiedPrompt(courseId) {
  try {
    const unifiedRef = doc(db, 'courses', courseId, 'prompts', 'unified')
    const unifiedDoc = await getDoc(unifiedRef)
    
    if (unifiedDoc.exists()) {
      const data = unifiedDoc.data()
      return {
        banca: data.banca || '',
        concursoName: data.concursoName || '',
        prompt: data.prompt || '',
      }
    }
    
    // Fallback: tentar buscar do documento do curso
    const courseRef = doc(db, 'courses', courseId)
    const courseDoc = await getDoc(courseRef)
    if (courseDoc.exists()) {
      const courseData = courseDoc.data()
      return {
        banca: courseData.banca || '',
        concursoName: courseData.competition || courseData.name || '',
        prompt: '',
      }
    }
    
    return null
  } catch (err) {
    console.error('Erro ao buscar prompt unificado:', err)
    return null
  }
}

/**
 * Constrói o prompt base para questões
 * @param {string} courseId - ID do curso
 * @param {string} materia - Matéria da questão
 * @param {string} editalText - Texto do edital (opcional)
 * @param {string} flashcardsContent - Conteúdo dos flashcards (opcional)
 * @returns {Promise<string>}
 */
export async function buildQuestionPrompt(courseId, materia, editalText = '', flashcardsContent = '') {
  const unified = await getUnifiedPrompt(courseId)
  
  if (!unified || !unified.banca || !unified.concursoName) {
    // Fallback para prompt padrão se não houver prompt unificado
    return `Você é um especialista em criar questões de concursos públicos.

REGRAS PARA AS QUESTÕES:
- Questões objetivas, claras, com alternativas bem elaboradas
- Cada questão deve ter 5 alternativas (A, B, C, D, E)
- Apenas UMA alternativa está correta
- As alternativas incorretas devem ser plausíveis (distratores inteligentes)
- Baseie-se PRIMARIAMENTE no conteúdo dos flashcards fornecidos abaixo
- Questões devem ser FICTÍCIAS (não são questões reais de provas anteriores)
- Foque em temas relevantes para a matéria "${materia}"
- Enunciados claros e objetivos
- Alternativas com linguagem formal e técnica quando apropriado

${editalText ? `CONTEXTO DO EDITAL:\n${editalText}\n\n` : ''}

${flashcardsContent ? `⚠️ CONTEÚDO PRINCIPAL - FLASHCARDS:\nUse ESTE conteúdo como base principal para criar as questões:\n\n${flashcardsContent}\n\n` : ''}

TAREFA: Criar questões FICTÍCIAS de múltipla escolha para a matéria "${materia}".

IMPORTANTE: Gere MUITAS questões (mínimo 20, ideal 30+). NÃO pare em 10 questões. Quanto mais questões, melhor.`
  }
  
  // Construir prompt usando dados unificados
  return `${unified.prompt}

═══════════════════════════════════════════════════════════════════════════════
INFORMAÇÕES DO CONCURSO
═══════════════════════════════════════════════════════════════════════════════
BANCA: ${unified.banca}
CONCURSO: ${unified.concursoName}
MATÉRIA: ${materia}

${editalText ? `CONTEXTO DO EDITAL:\n${editalText}\n\n` : ''}

${flashcardsContent ? `⚠️ CONTEÚDO PRINCIPAL - FLASHCARDS:\nUse ESTE conteúdo como base principal para criar as questões:\n\n${flashcardsContent}\n\n` : ''}

TAREFA: Criar questões FICTÍCIAS de múltipla escolha no estilo da banca ${unified.banca} para o concurso ${unified.concursoName}, matéria "${materia}".

REGRAS ESPECÍFICAS:
- Estilo da banca ${unified.banca}
- Questões devem ser FICTÍCIAS mas realistas
- Baseie-se PRIMARIAMENTE no conteúdo dos flashcards fornecidos
- Cada questão deve ter 5 alternativas (A, B, C, D, E)
- Apenas UMA alternativa está correta
- As alternativas incorretas devem ser plausíveis (distratores inteligentes)

QUANTIDADE DE QUESTÕES:
- Gere MUITAS questões (mínimo 20, ideal 30+ questões)
- NÃO pare em 10 questões - isso é insuficiente
- Quanto mais questões você gerar, melhor será a cobertura do conteúdo
- NÃO há limite máximo - gere o máximo possível dentro do limite de tokens`
}

/**
 * Constrói o prompt base para simulados
 * @param {string} courseId - ID do curso
 * @param {string} editalText - Texto do edital (opcional)
 * @param {string} flashcardsContent - Conteúdo dos flashcards (opcional)
 * @returns {Promise<string>}
 */
export async function buildSimuladoPrompt(courseId, editalText = '', flashcardsContent = '') {
  const unified = await getUnifiedPrompt(courseId)
  
  if (!unified || !unified.banca || !unified.concursoName) {
    // Fallback
    return `Você é um especialista em criar simulados de concursos públicos.

${editalText ? `CONTEXTO DO EDITAL:\n${editalText}\n\n` : ''}

${flashcardsContent ? `FLASHCARDS DO CURSO (USE COMO BASE):\n${flashcardsContent}\n\n` : ''}

TAREFA: Criar um simulado completo com questões objetivas FICTÍCIAS.`
  }
  
  return `${unified.prompt}

═══════════════════════════════════════════════════════════════════════════════
INFORMAÇÕES DO CONCURSO
═══════════════════════════════════════════════════════════════════════════════
BANCA: ${unified.banca}
CONCURSO: ${unified.concursoName}

${editalText ? `CONTEXTO DO EDITAL:\n${editalText}\n\n` : ''}

${flashcardsContent ? `FLASHCARDS DO CURSO (USE COMO BASE):\n${flashcardsContent}\n\n` : ''}

TAREFA: Criar um simulado completo no estilo da banca ${unified.banca} para o concurso ${unified.concursoName}.

REGRAS ESPECÍFICAS:
- Estilo da banca ${unified.banca}
- Questões devem ser FICTÍCIAS mas realistas
- Baseie-se PRIMARIAMENTE no conteúdo dos flashcards fornecidos
- Estrutura do simulado deve refletir a prova real do concurso`
}

/**
 * Constrói o prompt base para redação
 * @param {string} courseId - ID do curso
 * @param {string} editalText - Texto do edital (opcional)
 * @returns {Promise<string>}
 */
export async function buildRedacaoPrompt(courseId, editalText = '') {
  const unified = await getUnifiedPrompt(courseId)
  
  if (!unified || !unified.banca || !unified.concursoName) {
    // Fallback
    return `Você é um especialista em criar temas de redação para concursos públicos.

${editalText ? `CONTEXTO DO EDITAL:\n${editalText}\n\n` : ''}

TAREFA: Criar um tema de redação apropriado para o concurso.`
  }
  
  return `${unified.prompt}

═══════════════════════════════════════════════════════════════════════════════
INFORMAÇÕES DO CONCURSO
═══════════════════════════════════════════════════════════════════════════════
BANCA: ${unified.banca}
CONCURSO: ${unified.concursoName}

${editalText ? `CONTEXTO DO EDITAL:\n${editalText}\n\n` : ''}

TAREFA: Criar um tema de redação no estilo da banca ${unified.banca} para o concurso ${unified.concursoName}.

REGRAS ESPECÍFICAS:
- Estilo da banca ${unified.banca}
- Tema deve ser relevante para o cargo do concurso
- Seguir os critérios de avaliação da banca`
}

/**
 * Constrói o prompt base para análise de redação
 * @param {string} courseId - ID do curso
 * @param {string} tema - Tema da redação
 * @param {string} editalText - Texto do edital (opcional)
 * @returns {Promise<string>}
 */
export async function buildRedacaoAnalysisPrompt(courseId, tema, editalText = '') {
  const unified = await getUnifiedPrompt(courseId)
  
  if (!unified || !unified.banca || !unified.concursoName) {
    // Fallback
    return `Você é um corretor especializado em redações de concursos públicos.

⚠️ REGRA CRÍTICA: Cada redação é ÚNICA. Você DEVE analisar o CONTEÚDO REAL de cada texto e atribuir notas DIFERENTES baseadas na qualidade REAL.

CONCURSO: Concurso
TEMA DA REDAÇÃO: ${tema}

${editalText ? `CONTEXTO DO EDITAL:\n${editalText}\n\n` : ''}

Analise a redação e atribua uma nota de 0 a 1000 baseada na qualidade REAL do texto fornecido.`
  }
  
  return `${unified.prompt}

═══════════════════════════════════════════════════════════════════════════════
INFORMAÇÕES DO CONCURSO
═══════════════════════════════════════════════════════════════════════════════
BANCA: ${unified.banca}
CONCURSO: ${unified.concursoName}
TEMA DA REDAÇÃO: ${tema}

${editalText ? `CONTEXTO DO EDITAL:\n${editalText}\n\n` : ''}

⚠️⚠️⚠️ REGRAS CRÍTICAS DE AVALIAÇÃO ⚠️⚠️⚠️
- Cada redação é ÚNICA e deve ser avaliada INDIVIDUALMENTE
- NÃO use notas genéricas, padrões ou médias
- Analise o CONTEÚDO REAL do texto fornecido
- A nota deve refletir EXATAMENTE a qualidade do texto específico
- Se o texto tiver erros, dê nota baixa. Se for excelente, dê nota alta.
- VARIE as notas conforme a qualidade REAL de cada redação

TAREFA: Analisar a redação seguindo os critérios da banca ${unified.banca} e atribuir uma nota de 0 a 1000 baseada na qualidade REAL do texto.

REGRAS ESPECÍFICAS:
- Use os critérios de avaliação da banca ${unified.banca}
- Seja rigoroso mas justo na avaliação
- Considere o tema proposto e a adequação ao concurso ${unified.concursoName}
- Analise CADA aspecto do texto fornecido
- NÃO use notas genéricas - cada redação é única`
}

/**
 * Constrói o prompt base para flashcards
 * @param {string} courseId - ID do curso
 * @param {string} materia - Matéria do flashcard
 * @param {string} editalText - Texto do edital (opcional)
 * @returns {Promise<string>}
 */
export async function buildFlashcardPrompt(courseId, materia, editalText = '') {
  const unified = await getUnifiedPrompt(courseId)
  
  if (!unified || !unified.banca || !unified.concursoName) {
    // Fallback
    return `Você é um especialista em criar flashcards educacionais para concursos públicos.

MATÉRIA: ${materia}

${editalText ? `CONTEXTO DO EDITAL:\n${editalText}\n\n` : ''}

TAREFA: Criar flashcards educacionais para a matéria "${materia}".

⚠️ REGRAS CRÍTICAS PARA FLASHCARDS DE CONCURSO PÚBLICO:
1. NÃO crie flashcards com conteúdo óbvio ou muito básico (ex: "O que é direito?" para concursos jurídicos)
2. EVITE definições genéricas que não são úteis para prova
3. FOCO em conceitos específicos, legislações, jurisprudência, doutrina e temas recorrentes
4. Crie flashcards com nível de dificuldade MÉDIO a AVANÇADO
5. INCLUA informações específicas: números de leis, artigos, súmulas, datas, valores
6. CONTEÚDO deve ser 100% acurado e verificável
7. EVITE perguntas subjetivas ou opiniões
8. FOQUE em temas que realmente caem nas provas da banca
9. Crie flashcards que exijam conhecimento técnico e específico
10. INCLUA detalhes que fazem a diferença na prova

FORMATO OBRIGATÓRIO:
Retorne APENAS JSON válido com esta estrutura:
{
  "flashcards": [
    {
      "pergunta": "Pergunta específica e técnica",
      "resposta": "Resposta detalhada e precisa",
      "materia": "${materia}",
      "modulo": "Nome do módulo específico"
    }
  ]
}

QUANTIDADE: Mínimo 15 flashcards de alta qualidade.`
  }
  
  return `${unified.prompt}

═══════════════════════════════════════════════════════════════════════════════
INFORMAÇÕES DO CONCURSO
═══════════════════════════════════════════════════════════════════════════════
BANCA: ${unified.banca}
CONCURSO: ${unified.concursoName}
MATÉRIA: ${materia}

${editalText ? `CONTEXTO DO EDITAL:\n${editalText}\n\n` : ''}

TAREFA: Criar flashcards educacionais de ALTA QUALIDADE para o concurso ${unified.concursoName}, matéria "${materia}", no estilo da banca ${unified.banca}.

⚠️⚠️⚠️ REGRAS CRÍTICAS PARA FLASHCARDS DE CONCURSO PÚBLICO ⚠️⚠️⚠️
1. NÃO crie flashcards com conteúdo óbvio ou muito básico
2. EVITE definições genéricas que não são úteis para prova
3. FOCO em conceitos específicos, legislações, jurisprudência, doutrina e temas recorrentes
4. Crie flashcards com nível de dificuldade MÉDIO a AVANÇADO
5. INCLUA informações específicas: números de leis, artigos, súmulas, datas, valores
6. CONTEÚDO deve ser 100% acurado e verificável
7. EVITE perguntas subjetivas ou opiniões
8. FOQUE em temas que realmente caem nas provas da banca ${unified.banca}
9. Crie flashcards que exijam conhecimento técnico e específico
10. INCLUA detalhes que fazem a diferença na prova
11. ADAPTE o conteúdo ao estilo e foco da banca ${unified.banca}
12. CONSIDERE as particularidades do concurso ${unified.concursoName}

EXEMPLOS DO QUE EVITAR:
❌ "O que é administração pública?" (muito genérico)
❌ "O que significa constitucional?" (óbvio)
❌ "Direito é o que?" (subjetivo e básico)

EXEMPLOS DO QUE CRIAR:
✅ "Segundo o art. 37 da CF, quais são os princípios da administração pública?"
✅ "Qual a diferença entre servidor público efetivo e comissionado segundo a Lei 8.112/90?"
✅ "Qual o prazo para a Administração anular seus próprios atos segundo a Súmula 473 do STF?"

FORMATO OBRIGATÓRIO:
Retorne APENAS JSON válido com esta estrutura:
{
  "flashcards": [
    {
      "pergunta": "Pergunta específica e técnica",
      "resposta": "Resposta detalhada e precisa",
      "materia": "${materia}",
      "modulo": "Nome do módulo específico baseado no conteúdo"
    }
  ]
}

QUANTIDADE: Mínimo 15 flashcards de alta qualidade. Priorize QUALIDADE sobre quantidade.`
}

/**
 * Constrói o prompt base para mapas mentais
 * @param {string} courseId - ID do curso
 * @param {string} materia - Matéria do mapa mental
 * @param {string} editalText - Texto do edital (opcional)
 * @returns {Promise<string>}
 */
export async function buildMindMapPrompt(courseId, materia, editalText = '') {
  const unified = await getUnifiedPrompt(courseId)
  
  if (!unified || !unified.banca || !unified.concursoName) {
    // Fallback
    return `Você é um especialista em criar mapas mentais educacionais para concursos públicos.

MATÉRIA: ${materia}

${editalText ? `CONTEXTO DO EDITAL:\n${editalText}\n\n` : ''}

TAREFA: Criar um mapa mental para a matéria "${materia}".`
  }
  
  return `${unified.prompt}

═══════════════════════════════════════════════════════════════════════════════
INFORMAÇÕES DO CONCURSO
═══════════════════════════════════════════════════════════════════════════════
BANCA: ${unified.banca}
CONCURSO: ${unified.concursoName}
MATÉRIA: ${materia}

${editalText ? `CONTEXTO DO EDITAL:\n${editalText}\n\n` : ''}

TAREFA: Criar um mapa mental organizando o conteúdo da matéria "${materia}" conforme a abordagem da banca ${unified.banca} no concurso ${unified.concursoName}.

REGRAS ESPECÍFICAS:
- Organizar conteúdo conforme a abordagem da banca ${unified.banca}
- Focar nos temas mais relevantes para o concurso ${unified.concursoName}
- Estrutura clara e hierárquica`
}




