/**
 * Gerador de Flashcards com Cache de Leis
 * Utiliza textos oficiais de leis para gerar flashcards precisos
 */

import LawDetector from './lawDetector';
import LawDownloader from './lawDownloader';

export class FlashcardGenerator {
  constructor() {
    this.lawDetector = new LawDetector();
    this.lawDownloader = new LawDownloader();
  }

  /**
   * Gera flashcards para uma matéria específica usando cache de leis
   * @param {string} subject - Matéria/tópico para gerar flashcards
   * @param {number} quantity - Quantidade de flashcards a gerar
   * @param {Object} aiModel - Modelo de IA para usar
   * @returns {Promise<Array>} - Array de flashcards gerados
   */
  async generateFlashcardsForSubject(subject, quantity = 15, aiModel) {
    try {
      console.log(`🧪 Gerando ${quantity} flashcards para: ${subject}`);
      
      // 1. Detecta leis no assunto
      const detectedLaws = this.lawDetector.detectLaws(subject);
      console.log(`🔍 Detectadas ${detectedLaws.length} leis em: ${subject}`);
      
      // 2. Baixa leis se necessário
      let downloadedLaws = [];
      if (detectedLaws.length > 0) {
        downloadedLaws = await this.lawDownloader.downloadMultipleLaws(detectedLaws);
        console.log(`✅ ${downloadedLaws.length} leis processadas`);
      }
      
      // 3. Prepara contexto com textos das leis
      const lawsContext = this.prepareLawsContext(downloadedLaws);
      
      // 4. Gera flashcards usando o contexto
      const flashcards = await this.generateWithAI(subject, quantity, lawsContext, aiModel);
      
      return flashcards;
      
    } catch (error) {
      console.error('Erro ao gerar flashcards:', error);
      throw error;
    }
  }

  /**
   * Prepara contexto das leis para incluir no prompt
   * @param {Array} laws - Array de leis baixadas
   * @returns {string} - Contexto formatado
   */
  prepareLawsContext(laws) {
    if (laws.length === 0) return '';
    
    return `\n\nLEIS E TEXTOS OFICIAIS DISPONÍVEIS:\n${laws.map(law => 
      `\n--- ${law.nome} ---\n${law.texto.substring(0, 3000)}${law.texto.length > 3000 ? '\n\n[... texto completo disponível no cache ...]' : ''}`
    ).join('\n\n')}`;
  }

  /**
   * Gera flashcards usando IA com contexto das leis
   * @param {string} subject - Assunto principal
   * @param {number} quantity - Quantidade de flashcards
   * @param {string} lawsContext - Contexto das leis
   * @param {Object} aiModel - Modelo de IA
   * @returns {Promise<Array>} - Flashcards gerados
   */
  async generateWithAI(subject, quantity, lawsContext, aiModel) {
    const prompt = `Você é um especialista em educação e concursos públicos.

Gere ${quantity} flashcards de alta qualidade sobre o assunto: "${subject}"

${lawsContext}

REGRAS CRÍTICAS:
1. Use APENAS informações do assunto e dos textos oficiais fornecidos
2. Se houver leis disponíveis, baseie-se PRINCIPALMENTE nos textos oficiais
3. Cada flashcard deve ter uma pergunta clara e uma resposta precisa
4. Para leis, cite artigos e números quando possível
5. Seja factual e evite interpretações pessoais
6. Organize do básico ao avançado
7. Inclua conceitos, definições, artigos importantes e aplicações práticas

FORMATO EXATO (JSON válido):
[
  {
    "pergunta": "Pergunta clara e objetiva",
    "resposta": "Resposta precisa e completa",
    "fonte": "Fonte da informação (se aplicável)",
    "dificuldade": "fácil|médio|difícil"
  }
]

IMPORTANTE:
- Retorne APENAS o JSON, sem explicações
- Se houver texto de lei disponível, use-o como fonte primária
- Seja preciso e cite números de artigos quando possível
- Varie o nível de dificuldade dos flashcards`;

    try {
      const result = await aiModel.generateContent(prompt);
      const response = result.response.text().trim();
      
      // Limpa e parseia o JSON
      const cleanResponse = response.replace(/```json\n?|\n?```/g, '').trim();
      const flashcards = JSON.parse(cleanResponse);
      
      // Valida e formata os flashcards
      return this.validateFlashcards(flashcards, subject);
      
    } catch (error) {
      console.error('Erro na geração com IA:', error);
      
      // Fallback: gera flashcards básicos sem IA
      return this.generateFallbackFlashcards(subject, quantity, lawsContext);
    }
  }

  /**
   * Valida e formata os flashcards gerados
   * @param {Array} flashcards - Flashcards brutos
   * @param {string} subject - Assunto principal
   * @returns {Array} - Flashcards validados
   */
  validateFlashcards(flashcards, subject) {
    if (!Array.isArray(flashcards)) {
      throw new Error('Resposta inválida: esperado array de flashcards');
    }
    
    return flashcards.map((card, index) => ({
      pergunta: card.pergunta || `Pergunta ${index + 1} sobre ${subject}`,
      resposta: card.resposta || `Resposta ${index + 1}`,
      fonte: card.fonte || 'Gerado por IA',
      dificuldade: card.dificuldade || 'médio',
      materia: subject,
      dataGeracao: new Date().toISOString()
    }));
  }

  /**
   * Gera flashcards de fallback quando IA falha
   * @param {string} subject - Assunto
   * @param {number} quantity - Quantidade
   * @param {string} lawsContext - Contexto das leis
   * @returns {Array} - Flashcards básicos
   */
  generateFallbackFlashcards(subject, quantity, lawsContext) {
    const flashcards = [];
    
    for (let i = 1; i <= quantity; i++) {
      flashcards.push({
        pergunta: `Pergunta ${i} sobre ${subject}`,
        resposta: `Resposta ${i} - Estudo necessário sobre ${subject}`,
        fonte: 'Fallback - IA indisponível',
        dificuldade: 'médio',
        materia: subject,
        dataGeracao: new Date().toISOString()
      });
    }
    
    return flashcards;
  }

  /**
   * Gera flashcards em lote para múltiplos assuntos
   * @param {Array} subjects - Array de assuntos
   * @param {number} quantityPerSubject - Quantidade por assunto
   * @param {Object} aiModel - Modelo de IA
   * @returns {Promise<Array>} - Todos os flashcards gerados
   */
  async generateBatchFlashcards(subjects, quantityPerSubject = 10, aiModel) {
    console.log(`📚 Gerando flashcards em lote para ${subjects.length} assuntos...`);
    
    const allFlashcards = [];
    
    for (const subject of subjects) {
      try {
        const flashcards = await this.generateFlashcardsForSubject(
          subject, 
          quantityPerSubject, 
          aiModel
        );
        
        allFlashcards.push(...flashcards);
        console.log(`✅ ${flashcards.length} flashcards gerados para: ${subject}`);
        
      } catch (error) {
        console.error(`❌ Erro ao gerar flashcards para ${subject}:`, error);
      }
    }
    
    console.log(`🎉 Total de ${allFlashcards.length} flashcards gerados!`);
    return allFlashcards;
  }

  /**
   * Detecta leis em um texto e baixa automaticamente
   * @param {string} text - Texto para analisar
   * @returns {Promise<Array>} - Leis processadas
   */
  async processLawsFromText(text) {
    const detectedLaws = this.lawDetector.detectLaws(text);
    
    if (detectedLaws.length === 0) {
      return [];
    }
    
    console.log(`🔍 Processando ${detectedLaws.length} leis detectadas...`);
    return await this.lawDownloader.downloadMultipleLaws(detectedLaws);
  }
}

export default FlashcardGenerator;
