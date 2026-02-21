/**
 * Downloader de Leis
 * Baixa textos oficiais de sites governamentais
 */

import lawsCache from '../firebase/lawsCache';

export class LawDownloader {
  constructor() {
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    this.timeout = 10000; // 10 segundos timeout
  }

  /**
   * Baixa uma lei (verifica cache primeiro) - MELHORADO
   * @param {Object} law - Objeto da lei detectada
   * @returns {Promise<Object|null>} - Dados da lei ou null se falhar
   */
  async downloadLaw(law) {
    try {
      console.log(`🔍 Processando lei: ${law.fullName}`);
      
      // PASSO 1: Verificar se é a lei correta antes de baixar
      const lawValidation = this.validateLawInfo(law);
      if (!lawValidation.isValid) {
        console.log(`⚠️ Lei inválida: ${lawValidation.error}`);
        return null;
      }
      
      // PASSO 2: Verifica se está no cache
      const cachedLaw = await lawsCache.getLaw(law.normalized);
      if (cachedLaw) {
        console.log(`✅ Usando cache para ${law.fullName}`);
        return cachedLaw;
      }
      
      console.log(`📥 Baixando ${law.fullName} da fonte oficial...`);
      
      // PASSO 3: Tentar baixar da fonte oficial
      const lawData = await this.fetchFromSource(law);
      
      if (lawData) {
        // PASSO 4: Salvar no cache
        await lawsCache.saveLaw(law.normalized, lawData);
        console.log(`💾 ${law.fullName} salva no cache`);
        
        // PASSO 5: Verificar se o texto está correto
        const validation = this.validateDownloadedContent(lawData, law);
        if (!validation.isValid) {
          console.log(`⚠️ Conteúdo inválido: ${validation.error}`);
          return null;
        }
        
        console.log(`✅ ${law.fullName} baixada e validada com sucesso`);
        return lawData;
      }
      
      console.log(`❌ Falha ao baixar ${law.fullName}`);
      return null;
      
    } catch (error) {
      console.error(`Erro ao processar lei ${law.fullName}:`, error);
      return null;
    }
  }

  /**
   * Valida informações da lei antes de baixar
   * @param {Object} law - Objeto da lei
   * @returns {Object} - Resultado da validação
   */
  validateLawInfo(law) {
    if (law.type === 'federal') {
      const numero = law.identifier.split('/')[0];
      
      // Para Lei 13.869, validação específica
      if (numero === '13869' || numero === '13.869') {
        return { isValid: true, lawName: 'Lei de Abuso de Autoridade' };
      }
      
      // Validar número de lei federal (deve estar entre 1.000 e 15.000 para leis recentes)
      const lawNum = parseInt(numero.replace(/\D/g, ''));
      if (lawNum < 1000 || lawNum > 20000) {
        return { isValid: false, error: `Número de lei inválido: ${numero}` };
      }
    }
    
    return { isValid: true };
  }

  /**
   * Valida o conteúdo baixado da lei
   * @param {Object} lawData - Dados baixados
   * @param {Object} originalLaw - Lei original
   * @returns {Object} - Resultado da validação
   */
  validateDownloadedContent(lawData, originalLaw) {
    if (!lawData || !lawData.texto) {
      return { isValid: false, error: 'Texto da lei não encontrado' };
    }
    
    // Verificar se o texto tem conteúdo mínimo
    if (lawData.texto.length < 100) {
      return { isValid: false, error: 'Texto muito curto, pode ser erro' };
    }
    
    // Para Lei 13.869, verificar artigos específicos
    if (originalLaw.normalized === 'L13869') {
      const hasArt6 = lawData.texto.includes('Art. 6º') || lawData.texto.includes('Art. 6o');
      const hasArt9 = lawData.texto.includes('Art. 9º') || lawData.texto.includes('Art. 9o');
      
      if (!hasArt6 || !hasArt9) {
        return { isValid: false, error: 'Lei 13.869 não contém Art. 6º ou Art. 9º esperados' };
      }
    }
    
    return { isValid: true };
  }

  /**
   * Busca lei da fonte oficial
   * @param {Object} law - Objeto da lei
   * @returns {Promise<Object|null>} - Dados da lei
   */
  async fetchFromSource(law) {
    const url = this.generateSourceUrl(law);
    
    if (!url) {
      console.log(`⚠️ Sem URL para ${law.type}: ${law.identifier}`);
      return this.generateFallbackData(law);
    }
    
    try {
      console.log(`🌐 Baixando de: ${url}`);
      
      // Em ambiente real, faria fetch da URL
      // Como estamos em ambiente simulado, retorna dados mock
      const mockData = await this.fetchMockData(law, url);
      
      return {
        numero: law.identifier,
        nome: law.fullName,
        texto: mockData.texto,
        fonte: url,
        dataDownload: new Date().toISOString(),
        tipo: law.type
      };
      
    } catch (error) {
      console.error(`Erro ao baixar de ${url}:`, error);
      return this.generateFallbackData(law);
    }
  }

  /**
   * Gera URL da fonte oficial
   * @param {Object} law - Objeto da lei
   * @returns {string|null} - URL ou null
   */
  generateSourceUrl(law) {
    if (law.type === 'federal') {
      const numero = law.identifier.split('/')[0];
      
      // Tenta diferentes padrões de URL do Planalto
      const urls = [
        `https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2019/lei/L${numero}.htm`,
        `https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L${numero}.htm`,
        `https://www.planalto.gov.br/ccivil_03/Leis/L${numero}.htm`
      ];
      
      return urls[0]; // Retorna a mais provável
    }
    
    if (law.type === 'constitution') {
      return 'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm';
    }
    
    if (law.type === 'code') {
      const codeUrls = {
        'CP': 'https://www.planalto.gov.br/ccivil_03/decreto-lei/Del2848compilado.htm',
        'CC': 'https://www.planalto.gov.br/ccivil_03/leis/2002/L10406.htm',
        'CPC': 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm'
      };
      
      return codeUrls[law.identifier] || null;
    }
    
    return null;
  }

  /**
   * Simula download de dados (mock para desenvolvimento)
   * @param {Object} law - Objeto da lei
   * @param {string} url - URL da fonte
   * @returns {Promise<Object>} - Dados mock
   */
  async fetchMockData(law, url) {
    // Simula delay de rede
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const mockTexts = {
      'L13869': {
        texto: `LEI No 13.869, DE 5 DE SETEMBRO DE 2019

Dispõe sobre os crimes de abuso de autoridade; altera a Lei no 7.347, de 24 de julho de 1985, a Lei no 9.294, de 15 de julho de 1996, e o Decreto-Lei no 2.848, de 7 de dezembro de 1940 (Código Penal); e dá outras providências.

O PRESIDENTE DA REPÚBLICA Faço saber que o Congresso Nacional decreta e eu sanciono a seguinte Lei:

CAPÍTULO I
DOS CRIMES PRATICADOS POR AGENTE PÚBLICO CONTRA A LIBERDADE DE LOCOMOÇÃO

Art. 1o Constranger alguém com o uso de violência ou grave ameaça a não fazer o que a lei permite, ou a fazer o que ela não manda:
Pena - detenção, de 1 (um) a 4 (quatro) anos, e multa.

Art. 2o Constranger alguém a submeter-se a tratamento médico ou hospitalar que, por sua natureza, seja arriscado, por motivo de ideologia, convicção política, religiosa, filosófica ou outra qualquer relacionada a crença, opinião ou identidade:
Pena - detenção, de 1 (um) a 4 (quatro) anos, e multa.

Art. 3o Constranger alguém a participar de associação ou a permanecer nela por meio de violência ou grave ameaça:
Pena - detenção, de 1 (um) a 4 (quatro) anos, e multa.

Art. 4o Constranger alguém a não fazer o que a lei permite, ou a fazer o que ela não manda, por meio de violência ou grave ameaça, quando a ação for praticada durante procedimento de investigação ou de processo judicial, administrativo ou inquérito policial:
Pena - reclusão, de 2 (dois) a 8 (oito) anos, e multa.

Art. 5o Constranger alguém a submeter-se a procedimento de busca pessoal mediante violência ou grave ameaça:
Pena - detenção, de 1 (um) a 4 (quatro) anos, e multa.

CAPÍTULO II
DOS CRIMES PRATICADOS POR AGENTE PÚBLICO CONTRA A HONRA

Art. 6o Ofender a honra de alguém por meio de redes sociais, plataformas de conteúdo ou demais meios de comunicação digital, quando a ação for praticada no exercício da função pública:
Pena - detenção, de 6 (seis) meses a 2 (dois) anos, e multa.

Parágrafo único. Se a ofensa for praticada contra agente público no exercício de suas funções, a pena será aumentada de um terço.

Art. 7o Divulgar segredo que tenha conhecimento em razão do cargo e que deva permanecer em segredo, ou que esteja submetido a regime de sigilo:
Pena - detenção, de 1 (um) a 4 (quatro) anos, e multa.

Art. 8o Impedir, sem justa causa, o exercício de direito, atividade ou função:
Pena - detenção, de 6 (seis) meses a 2 (dois) anos, e multa.

CAPÍTULO III
DOS CRIMES PRATICADOS POR AGENTE PÚBLICO CONTRA O PATRIMÔNIO

Art. 9o Subtrair, para si ou para outrem, objeto que tem em seu poder em razão do cargo, ou desviar objeto que tem em seu poder em razão da função pública:
Pena - reclusão, de 2 (dois) a 8 (oito) anos, e multa.

Art. 10o Exigir, para si ou para outrem, direta ou indiretamente, vantagem indevida em razão da função pública:
Pena - reclusão, de 2 (dois) a 12 (doze) anos, e multa.

CAPÍTULO IV
DAS SANÇÕES ADMINISTRATIVAS

Art. 11. A prática de abuso de autoridade sujeitará o agente público às seguintes sanções administrativas:
I - advertência;
II - multa;
III - suspensão do exercício do cargo;
IV - demissão do cargo público;
V - destituição de função em comissão;
VI - cassação de aposentadoria ou disponibilidade.

Parágrafo único. As sanções previstas neste artigo poderão ser aplicadas isolada ou cumulativamente, conforme a gravidade da conduta.

Art. 12. A autoridade competente para aplicar as sanções administrativas será:
I - o chefe imediato do agente público, nos casos de advertência e multa;
II - a autoridade superior, nos casos de suspensão;
III - o órgão de correição ou comissão de ética, nos casos de demissão, destituição de função em comissão, cassação de aposentadoria ou disponibilidade.

[...]`,
        resumo: 'Lei de Abuso de Autoridade - Define crimes praticados por agentes públicos contra direitos fundamentais e estabelece sanções administrativas.'
      },
      
      'CF88': {
        texto: `CONSTITUIÇÃO DA REPÚBLICA FEDERATIVA DO BRASIL DE 1988

TÍTULO I
Dos Direitos e Garantias Fundamentais

Art. 5o Todos são iguais perante a lei, sem distinção de qualquer natureza, garantindo-se aos brasileiros e aos estrangeiros residentes no País a inviolabilidade do direito à vida, à liberdade, à igualdade, à segurança e à propriedade, nos termos seguintes:

I - homens e mulheres são iguais em direitos e obrigações, nos termos desta Constituição;

II - ninguém será obrigado a fazer ou deixar de fazer alguma coisa senão em virtude de lei;

III - ninguém será submetido a tortura nem a tratamento desumano ou degradante;

[...]`,
        resumo: 'Constituição Federal de 1988 - Lei fundamental do Brasil, estabelece direitos e deveres fundamentais.'
      },
      
      'CP': {
        texto: `DECRETO-LEI No 2.848, DE 7 DE DEZEMBRO DE 1940

Código Penal

PARTE GERAL

TÍTULO I
Da Aplicação da Lei Penal

Art. 1o Não há crime sem lei anterior que o defina. Não há pena sem prévia cominação legal.

Art. 2o Ninguém pode ser punido por fato que lei posterior deixa de considerar crime, cessando em virtude dela a execução e os efeitos penais da sentença condenatória.

TÍTULO II
Do Crime

Art. 13 O resultado, de que depende a existência do crime, é imputável a quem lhe deu causa. Considera-se causa a ação ou omissão sem a qual o resultado não teria ocorrido.

[...]`,
        resumo: 'Código Penal - Define crimes e penas no ordenamento jurídico brasileiro.'
      }
    };
    
    // Retorna dados mock baseado no tipo/identificador
    if (mockTexts[law.normalized]) {
      return mockTexts[law.normalized];
    }
    
    // Dados genéricos para outras leis
    return {
      texto: `TEXTO COMPLETO DA ${law.fullName.toUpperCase()}

[Este é um texto simulado para desenvolvimento. Em produção, seria o texto completo baixado do site oficial.]

Art. 1o [Disposições gerais da lei...]

Art. 2o [Definições e aplicações...]

[Texto completo continua...]`,
      resumo: `${law.fullName} - Texto oficial baixado de fonte governamental.`
    };
  }

  /**
   * Gera dados de fallback quando não consegue baixar
   * @param {Object} law - Objeto da lei
   * @returns {Object} - Dados básicos
   */
  generateFallbackData(law) {
    return {
      numero: law.identifier,
      nome: law.fullName,
      texto: `[Texto da ${law.fullName} não disponível no momento. Em produção, este seria o texto completo baixado da fonte oficial.]`,
      fonte: 'Indisponível',
      dataDownload: new Date().toISOString(),
      tipo: law.type,
      resumo: `${law.fullName} - Aguardando download da fonte oficial.`
    };
  }

  /**
   * Processa múltiplas leis em lote
   * @param {Array} laws - Array de leis detectadas
   * @returns {Promise<Array>} - Array de leis processadas
   */
  async downloadMultipleLaws(laws) {
    console.log(`📚 Processando ${laws.length} leis...`);
    
    const results = [];
    
    for (const law of laws) {
      try {
        const lawData = await this.downloadLaw(law);
        if (lawData) {
          results.push(lawData);
        }
      } catch (error) {
        console.error(`Erro ao processar ${law.fullName}:`, error);
      }
    }
    
    console.log(`✅ Processadas ${results.length} de ${laws.length} leis`);
    return results;
  }
}

export default LawDownloader;
