import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/_next/',
          '/login',
          '/forgot-password',
          '/verify-email',
          '/dashboard',
        ],
      },
    ],
    sitemap: 'https://wazeapp.ai/sitemap.xml',
  }
}
