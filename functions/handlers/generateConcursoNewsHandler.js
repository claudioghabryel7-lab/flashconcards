const admin = require('firebase-admin')
const axios = require('axios')
const { verifyAdminRequest } = require('../emailUtils')
const { collectGeminiApiKeys } = require('../generation/geminiKeyPool')
const { generateAiJson } = require('../generation/geminiServer')

function assertGeminiConfigured() {
  if (!collectGeminiApiKeys().length) {
    const err = new Error('GEMINI_API_KEY não configurada')
    err.status = 500
    throw err
  }
}

async function handleGenerateConcursoNews(req, res) {
    // Responder a OPTIONS (preflight) imediatamente
    if (req.method === 'OPTIONS') {
      return res.status(200).end()
    }
    
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método não permitido' })
    }

    try {
      await verifyAdminRequest(req)

      try {
        assertGeminiConfigured()
      } catch {
        return res.status(500).json({ error: 'GEMINI_API_KEY não configurada' })
      }

      const { concursoEspecifico } = req.body || {}
      
      // Verificar se já existe notícia similar (evitar duplicatas)
      const postsRef = admin.firestore().collection('posts')
      
      // Buscar todas as notícias recentes para evitar duplicatas
      // Usar query simples sem orderBy para evitar necessidade de índice composto
      const recentNews = await postsRef
        .where('isConcursoNews', '==', true)
        .limit(50) // Buscar mais para depois ordenar em memória
        .get()
      
      // Ordenar em memória por data de criação (mais recente primeiro)
      const recentNewsList = recentNews.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(news => news.createdAt) // Filtrar apenas as que têm data
        .sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(0)
          const dateB = b.createdAt?.toDate?.() || new Date(0)
          return dateB.getTime() - dateA.getTime() // Mais recente primeiro
        })
        .slice(0, 10) // Pegar apenas as 10 mais recentes
        .map(news => news) // Remover o id, manter apenas os dados
      
      if (concursoEspecifico) {
        // Verificar se já existe notícia sobre este concurso específico (busca flexível)
        const concursoLower = concursoEspecifico.toLowerCase().trim()
        const existingNews = recentNewsList.find(news => {
          const newsConcursoName = (news.concursoData?.concursoName || '').toLowerCase().trim()
          const newsTitle = (news.seoTitle || news.text || '').toLowerCase().trim()
          const newsOrgao = (news.concursoData?.orgao || '').toLowerCase().trim()
          
          // Verificar se o nome do concurso, título ou órgão contém palavras-chave similares
          return newsConcursoName.includes(concursoLower) || 
                 concursoLower.includes(newsConcursoName) ||
                 newsTitle.includes(concursoLower) ||
                 newsOrgao.includes(concursoLower)
        })
        
        if (existingNews) {
          const lastNewsDate = existingNews.createdAt?.toDate?.() || new Date(0)
          const daysSinceLastNews = (Date.now() - lastNewsDate.getTime()) / (1000 * 60 * 60 * 24)
          
          // Se foi gerada há menos de 7 dias, não gerar novamente
          if (daysSinceLastNews < 7) {
            return res.status(400).json({ 
              error: 'Notícia sobre este concurso já foi gerada recentemente',
              message: `Uma notícia sobre "${existingNews.concursoData?.concursoName || existingNews.seoTitle || 'este concurso'}" foi gerada há ${Math.floor(daysSinceLastNews)} dias. Aguarde pelo menos 7 dias antes de gerar novamente.`
            })
          }
        }
      } else {
        // Verificar última notícia gerada para evitar repetição
        if (!recentNews.empty) {
          const lastNews = recentNewsList[0]
          const lastNewsDate = lastNews.createdAt?.toDate?.() || new Date(0)
          const hoursSinceLastNews = (Date.now() - lastNewsDate.getTime()) / (1000 * 60 * 60)
          
          // Se foi gerada há menos de 24 horas, não gerar novamente
          if (hoursSinceLastNews < 24) {
            return res.status(400).json({ 
              error: 'Notícia gerada recentemente',
              message: `Uma notícia foi gerada há ${Math.floor(hoursSinceLastNews)} horas. Aguarde pelo menos 24 horas antes de gerar novamente.`
            })
          }
        }
      }
      
      // Preparar lista de notícias recentes para a IA evitar repetição
      const recentTitles = recentNewsList.slice(0, 5).map(news => ({
        title: news.seoTitle || news.text || '',
        concurso: news.concursoData?.concursoName || '',
        date: news.createdAt?.toDate?.()?.toLocaleDateString('pt-BR') || ''
      }))

      // Preparar lista de notícias recentes para a IA evitar repetição
      const recentTitlesText = recentNewsList.length > 0 
        ? `\n\nNOTÍCIAS RECENTES JÁ GERADAS (EVITE REPETIR):\n${recentNewsList.slice(0, 5).map((n, i) => `${i + 1}. "${n.seoTitle || n.text || ''}" - ${n.concursoData?.concursoName || 'N/A'} (${n.createdAt?.toDate?.()?.toLocaleDateString('pt-BR') || ''})`).join('\n')}\n\nIMPORTANTE: NÃO gere uma notícia sobre os mesmos concursos listados acima. Escolha um concurso DIFERENTE ou uma atualização significativa com informações novas.`
        : ''
      
      // Prompt para IA buscar e gerar notícia sobre concursos
      const prompt = `Você é um especialista em concursos públicos brasileiros. 
      Sua tarefa é criar uma notícia completa e atualizada sobre concursos públicos abertos ou iminentes.
      
      ${concursoEspecifico ? `CONCURSO ESPECÍFICO SOLICITADO: "${concursoEspecifico}"
      
      IMPORTANTE: Você DEVE gerar uma notícia sobre este concurso específico. Foque todas as informações neste concurso. Seja detalhado e específico sobre este concurso.
      
      ATENÇÃO: Se já existe uma notícia recente sobre este mesmo concurso (ver lista abaixo), você DEVE gerar uma ATUALIZAÇÃO com informações novas, diferentes ou mais recentes. Não repita o mesmo conteúdo.${recentTitlesText}` : `GERE UMA NOTÍCIA SOBRE:
      - Concurso público aberto (com inscrições abertas)
      - Concurso público previsto/iminente (com edital previsto)
      - Atualização sobre concursos já abertos (novas vagas, prorrogação de prazo, etc.)

      FOCO PRINCIPAL:
      - Polícia Militar (PMGO, PMSP, PMRJ, etc.)
      - Polícia Civil (PC)
      - Guarda Municipal (GCM)
      - Outros concursos públicos relevantes${recentTitlesText}`}

      INFORMAÇÕES OBRIGATÓRIAS A INCLUIR:
      1. Nome do concurso e órgão
      2. Número de vagas (se disponível)
      3. Remuneração/salário (se disponível)
      4. Data de abertura das inscrições (se aplicável)
      5. Data de encerramento das inscrições (se aplicável)
      6. Data prevista da prova (se disponível)
      7. Conteúdo programático (principais matérias)
      8. Requisitos básicos (escolaridade, idade, etc.)
      9. Link do edital (se disponível)
      10. Banca organizadora (se conhecida)

      FORMATO DE RESPOSTA (JSON VÁLIDO):
      {
        "title": "Título da notícia (SEO otimizado)",
        "summary": "Resumo curto em 1-2 frases",
        "content": "Conteúdo completo da notícia em HTML (use <p>, <h2>, <h3>, <ul>, <li>, <strong>)",
        "concursoName": "Nome do concurso",
        "orgao": "Órgão/Instituição",
        "vagas": "Número de vagas ou 'A definir'",
        "remuneracao": "Remuneração/salário ou 'A definir'",
        "dataInscricaoInicio": "Data de início das inscrições ou null",
        "dataInscricaoFim": "Data de fim das inscrições ou null",
        "dataProva": "Data prevista da prova ou null",
        "banca": "Banca organizadora ou 'A definir'",
        "requisitos": "Requisitos básicos",
        "conteudoProgramatico": "Principais matérias do conteúdo programático",
        "linkEdital": "Link do edital ou null",
        "status": "aberto|previsto|atualizacao",
        "tags": ["concurso público", "PMGO", "polícia militar", "vagas", etc],
        "keywords": "palavras-chave para SEO separadas por vírgula"
      }

      IMPORTANTE:
      - Seja específico e atualizado
      - Use informações reais quando possível
      - Se não souber alguma informação, use "A definir" ou null
      - O título deve ser otimizado para SEO
      - O conteúdo deve ser rico em palavras-chave relacionadas
      - Retorne APENAS o JSON, sem markdown, sem explicações adicionais
      - Comece diretamente com { e termine com }`

      console.log('🤖 Gerando notícia de concurso com IA...')
      let newsData
      try {
        newsData = await generateAiJson(prompt, {
          useGoogleSearch: true,
          generationConfig: { maxOutputTokens: 8000, temperature: 0.7 },
        })
      } catch (aiError) {
        console.error('Erro ao gerar/parsear JSON da IA:', aiError)
        return res.status(500).json({
          error: 'Erro ao processar resposta da IA',
          message: aiError?.message || 'Falha na geração',
        })
      }

      // Validar dados obrigatórios
      if (!newsData.title || !newsData.content) {
        return res.status(500).json({ error: 'IA não retornou dados completos', data: newsData })
      }

      // Criar slug do título
      const slug = newsData.title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')

      // Salvar no Firestore
      const newsRef = admin.firestore().collection('posts')
      
      const newsDoc = {
        text: newsData.summary || newsData.title,
        fullText: newsData.content,
        authorName: 'FlashConCards IA',
        authorId: 'system-ai-news', // ID especial para notícias geradas por IA
        isNews: true,
        isConcursoNews: true, // Flag especial para notícias de concursos
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        // Dados específicos de concurso
        concursoData: {
          concursoName: newsData.concursoName || '',
          orgao: newsData.orgao || '',
          vagas: newsData.vagas || 'A definir',
          remuneracao: newsData.remuneracao || 'A definir',
          dataInscricaoInicio: newsData.dataInscricaoInicio || null,
          dataInscricaoFim: newsData.dataInscricaoFim || null,
          dataProva: newsData.dataProva || null,
          banca: newsData.banca || 'A definir',
          requisitos: newsData.requisitos || '',
          conteudoProgramatico: newsData.conteudoProgramatico || '',
          linkEdital: newsData.linkEdital || null,
          status: newsData.status || 'aberto',
        },
        tags: newsData.tags || [],
        keywords: newsData.keywords || '',
        slug: slug,
        seoTitle: newsData.title,
        seoDescription: newsData.summary || newsData.title.substring(0, 160),
      }

      const docRef = await newsRef.add(newsDoc)

      console.log('✅ Notícia gerada e salva com sucesso:', docRef.id)

      return res.status(200).json({
        success: true,
        newsId: docRef.id,
        data: newsDoc
      })

    } catch (error) {
      console.error('Erro ao gerar notícia de concurso:', error)
      const status = error.status || 500
      return res.status(status).json({ 
        error: status === 401 || status === 403 ? error.message : 'Erro ao gerar notícia', 
        message: error.message 
      })
    }
}

module.exports = { handleGenerateConcursoNews }
