/**
 * Detector de Leis em Textos
 * Identifica referências a leis e normativos em textos
 */

export class LawDetector {
  constructor() {
    // Padrões para identificar diferentes tipos de leis
    this.patterns = {
      // Leis federais: "Lei 13.869/2019", "13.869/2019", "L.13.869/2019"
      federalLaw: /(?:lei\s+|l\.?\s*)?(\d{1,5})[.,\/]?(\d{4})/gi,
      
      // Leis com apenas número: "Lei 13.869", "13.869"
      simpleLaw: /(?:lei\s+|l\.?\s*)?(\d{1,5}(?:\.\d{1,3})?)/gi,
      
      // Constituição: "Constituição Federal", "CF/88", "Constituição de 1988"
      constitution: /constitui(?:ç|c)(?:ã|a)o\s+(?:federal|de\s+1988|cf\/88)/gi,
      
      // Códigos: "Código Penal", "CP", "Código Civil", "CC"
      codes: /código\s+(penal|civil|processual\s+civil|processual\s+penal|tributário|comercial|eleitoral|militar|consumidor)|cp|cc|cpc|cpp|ctn|c(?:e|om|on|el|mi|ons)/gi,
      
      // Emendas: "Emenda Constitucional 45", "EC 45/2004"
      amendment: /(?:emenda\s+constitucional|ec\s+)(\d{1,3})(?:\/(\d{4}))?/gi,
      
      // Medidas Provisórias: "Medida Provisória 905/2019", "MP 905"
      provisional: /(?:medida\s+provisória|mp\s+)(\d{1,4})(?:\/(\d{4}))?/gi,
      
      // Decretos: "Decreto-lei 2.848/1940", "DL 2.848"
      decree: /(?:decreto[-\s]?lei|dl\s+)(\d{1,5})(?:\/(\d{4}))?/gi,
      
      // Resoluções: "Resolução 123/2022", "Res. 123/2022"
      resolution: /(?:resolu(?:ç|c)(?:ã|a)o|res\.?\s+)(\d{1,4})(?:\/(\d{4}))?/gi
    };
  }

  /**
   * Detecta todas as leis referenciadas em um texto
   * @param {string} text - Texto para analisar
   * @returns {Array} - Array de leis detectadas
   */
  detectLaws(text) {
    const detectedLaws = [];
    
    // Detecta leis federais
    const federalMatches = text.match(this.patterns.federalLaw);
    if (federalMatches) {
      federalMatches.forEach(match => {
        const cleanMatch = match.replace(/[^\d\/]/g, '');
        if (cleanMatch.includes('/')) {
          const [numero, ano] = cleanMatch.split('/');
          detectedLaws.push({
            type: 'federal',
            identifier: `${numero}/${ano}`,
            original: match,
            normalized: `L${numero}`,
            fullName: `Lei ${numero}/${ano}`
          });
        }
      });
    }
    
    // Detecta leis simples (sem ano)
    const simpleMatches = text.match(this.patterns.simpleLaw);
    if (simpleMatches) {
      simpleMatches.forEach(match => {
        const cleanMatch = match.replace(/[^\d]/g, '');
        // Evita duplicatas com as federais
        if (!detectedLaws.find(law => law.original === match)) {
          detectedLaws.push({
            type: 'federal',
            identifier: cleanMatch,
            original: match,
            normalized: `L${cleanMatch}`,
            fullName: `Lei ${cleanMatch}`
          });
        }
      });
    }
    
    // Detecta Constituição
    if (this.patterns.constitution.test(text)) {
      detectedLaws.push({
        type: 'constitution',
        identifier: 'CF/88',
        original: 'Constituição Federal',
        normalized: 'CF88',
        fullName: 'Constituição Federal de 1988'
      });
    }
    
    // Detecta Códigos
    const codeMatches = text.match(this.patterns.codes);
    if (codeMatches) {
      const codeMap = {
        'penal': 'CP',
        'civil': 'CC', 
        'processual civil': 'CPC',
        'processual penal': 'CPP',
        'tributário': 'CTN',
        'comercial': 'CCOM',
        'eleitoral': 'CE',
        'militar': 'CM',
        'consumidor': 'CDC',
        'cp': 'CP',
        'cc': 'CC',
        'cpc': 'CPC',
        'cpp': 'CPP',
        'ctn': 'CTN',
        'com': 'CCOM',
        'eon': 'CE',
        'el': 'CE',
        'mi': 'CM',
        'cm': 'CM',
        'ons': 'CDC',
        'cons': 'CDC'
      };
      
      codeMatches.forEach(match => {
        const cleanMatch = match.toLowerCase().trim();
        const codeKey = Object.keys(codeMap).find(key => cleanMatch.includes(key));
        
        if (codeKey && !detectedLaws.find(law => law.normalized === codeMap[codeKey])) {
          detectedLaws.push({
            type: 'code',
            identifier: codeMap[codeKey],
            original: match,
            normalized: codeMap[codeKey],
            fullName: this.getCodeFullName(codeMap[codeKey])
          });
        }
      });
    }
    
    // Remove duplicatas
    const uniqueLaws = detectedLaws.filter((law, index, self) => 
      index === self.findIndex(l => l.normalized === law.normalized)
    );
    
    console.log(`🔍 Detectadas ${uniqueLaws.length} leis no texto:`, uniqueLaws);
    return uniqueLaws;
  }

  /**
   * Retorna nome completo do código
   * @param {string} code - Sigla do código
   * @returns {string} - Nome completo
   */
  getCodeFullName(code) {
    const codeNames = {
      'CP': 'Código Penal',
      'CC': 'Código Civil',
      'CPC': 'Código de Processo Civil',
      'CPP': 'Código de Processo Penal',
      'CTN': 'Código Tributário Nacional',
      'CCOM': 'Código Comercial',
      'CE': 'Código Eleitoral',
      'CM': 'Código Militar',
      'CDC': 'Código de Defesa do Consumidor'
    };
    
    return codeNames[code] || `Código ${code}`;
  }

  /**
   * Gera URL para download da lei no Planalto
   * @param {Object} law - Objeto da lei detectada
   * @returns {string|null} - URL para download ou null se não aplicável
   */
  generatePlanaltoUrl(law) {
    if (law.type === 'federal') {
      // Para leis federais, tenta construir URL do Planalto
      const numero = law.identifier.split('/')[0];
      
      // Padrões CORRETOS de URLs do Planalto (com maiúsculas)
      const urlPatterns = [
        `https://www.planalto.gov.br/ccivil_03/_Ato2019-2022/2019/Lei/L${numero}.htm`,
        `https://www.planalto.gov.br/ccivil_03/_Ato2015-2018/2018/Lei/L${numero}.htm`,
        `https://www.planalto.gov.br/ccivil_03/_Ato2011-2014/2014/Lei/L${numero}.htm`,
        `https://www.planalto.gov.br/ccivil_03/_Ato2007-2010/2010/Lei/L${numero}.htm`,
        `https://www.planalto.gov.br/ccivil_03/Leis/L${numero}.htm`
      ];
      
      // Para Lei 13.869, URL específica correta
      if (numero === '13869' || numero === '13.869') {
        return 'https://www.planalto.gov.br/ccivil_03/_Ato2019-2022/2019/Lei/L13869.htm';
      }
      
      return urlPatterns[0]; // Retorna o padrão mais recente
    }
    
    if (law.type === 'constitution') {
      return 'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm';
    }
    
    if (law.type === 'code') {
      const codeUrls = {
        'CP': 'https://www.planalto.gov.br/ccivil_03/decreto-lei/Del2848compilado.htm',
        'CC': 'https://www.planalto.gov.br/ccivil_03/leis/2002/L10406.htm',
        'CPC': 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm',
        'CPP': 'https://www.planalto.gov.br/ccivil_03/leis/l5869compilado.htm',
        'CTN': 'https://www.planalto.gov.br/ccivil_03/leis/l5172.htm'
      };
      
      return codeUrls[law.identifier] || null;
    }
    
    return null;
  }
}

export default LawDetector;
