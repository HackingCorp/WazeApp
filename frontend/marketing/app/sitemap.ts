import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://wazeapp.ai'

  return [
    {
      url: baseUrl,
      lastModified: new Date('2026-05-02'),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/features`,
      lastModified: new Date('2026-05-05'),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: new Date('2026-05-05'),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/how-it-works`,
      lastModified: new Date('2026-05-02'),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/use-cases`,
      lastModified: new Date('2026-05-02'),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date('2026-04-15'),
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/blog/whatsapp-ai-customer-service`,
      lastModified: new Date('2026-04-15'),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/blog/whatsapp-business-api`,
      lastModified: new Date('2026-04-15'),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/blog/future-conversational-ai`,
      lastModified: new Date('2026-04-15'),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date('2026-05-05'),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: new Date('2026-05-05'),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date('2026-05-05'),
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date('2026-05-05'),
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/register`,
      lastModified: new Date('2026-04-15'),
      changeFrequency: 'yearly',
      priority: 0.5,
    },
  ]
}
