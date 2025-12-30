import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'

/**
 * Componente para gerar sitemap.xml dinamicamente
 * Acessível em /sitemap.xml
 */
const Sitemap = () => {
  const [xml, setXml] = useState('')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const generateSitemap = async () => {
      try {
        const baseUrl = typeof window !== 'undefined' 
          ? window.location.origin 
          : 'https://www.flashconcards.com.br'

        // Buscar todos os cursos ativos
        const coursesRef = collection(db, 'courses')
        const coursesSnapshot = await getDocs(coursesRef)
        
        const courses = coursesSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(course => course.active !== false)

        // URLs estáticas com palavras-chave
        const staticUrls = [
          { loc: `${baseUrl}/`, changefreq: 'daily', priority: '1.0' },
          { loc: `${baseUrl}/guia-estudos`, changefreq: 'weekly', priority: '0.8' },
          { loc: `${baseUrl}/pagamento`, changefreq: 'weekly', priority: '0.9' },
        ]

        // URLs dinâmicas dos cursos
        const courseUrls = courses.map(course => ({
          loc: `${baseUrl}/curso/${course.id}`,
          changefreq: 'weekly',
          priority: course.featured ? '0.9' : '0.8',
          lastmod: course.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString()
        }))

        // Gerar XML
        const allUrls = [...staticUrls, ...courseUrls]
        
        const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(url => `  <url>
    <loc>${url.loc}</loc>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
    ${url.lastmod ? `<lastmod>${url.lastmod}</lastmod>` : ''}
  </url>`).join('\n')}
</urlset>`

        setXml(sitemapXml)
        setLoading(false)
        
        // Enviar XML diretamente como resposta
        if (typeof window !== 'undefined' && xml) {
          // Criar blob e fazer download ou exibir
          const blob = new Blob([sitemapXml], { type: 'application/xml' })
          const url = URL.createObjectURL(blob)
          // Não redirecionar, apenas mostrar o XML
        }
      } catch (error) {
        console.error('Erro ao gerar sitemap:', error)
        setLoading(false)
      }
    }

    generateSitemap()
  }, [])
  
  // Quando XML estiver pronto, atualizar o documento
  useEffect(() => {
    if (xml && !loading && typeof document !== 'undefined') {
      // Substituir todo o conteúdo do body com o XML
      document.body.innerHTML = `<pre style="white-space: pre-wrap; word-break: break-word; padding: 20px; font-family: monospace;">${xml}</pre>`
      // Tentar definir content-type (pode não funcionar em todos os navegadores)
      try {
        document.contentType = 'application/xml'
      } catch (e) {
        // Ignorar erro
      }
    }
  }, [xml, loading])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Gerando sitemap...</p>
      </div>
    )
  }

  // Retornar XML com content-type correto
  useEffect(() => {
    if (xml && typeof document !== 'undefined') {
      // Definir content-type para XML
      document.contentType = 'application/xml'
    }
  }, [xml])

  // Retornar XML como texto puro
  return (
    <div style={{ display: 'none' }}>
      <pre>{xml}</pre>
    </div>
  )
}

export default Sitemap

