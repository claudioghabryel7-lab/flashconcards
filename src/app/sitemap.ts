import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const publicRoutes = [
    { path: '/', priority: 1, changeFrequency: 'daily' as const },
    { path: '/cursos', priority: 0.95, changeFrequency: 'daily' as const },
    { path: '/login', priority: 0.6, changeFrequency: 'monthly' as const },
    { path: '/guia-estudos', priority: 0.75, changeFrequency: 'weekly' as const },
    { path: '/tutorial', priority: 0.7, changeFrequency: 'monthly' as const },
    { path: '/politica-privacidade', priority: 0.3, changeFrequency: 'yearly' as const },
    { path: '/demo', priority: 0.65, changeFrequency: 'monthly' as const },
  ]

  return publicRoutes.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }))
}
