'use client';

import Link from "next/link"
import { notFound, useParams } from "next/navigation"
import { useTranslations } from "@/lib/hooks/use-translations"

export default function BlogPostPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const { t } = useTranslations();

  // Map slugs to translation keys
  const postConfig: Record<string, { titleKey: string; excerptKey: string; dateKey: string; contentKey: string; readTime: number }> = {
    "transform-customer-service": {
      titleKey: 'blogPost1Title',
      excerptKey: 'blogPost1Excerpt',
      dateKey: 'blogPost1Date',
      contentKey: 'blogPost1Content',
      readTime: 5,
    },
    "whatsapp-business-api-guide": {
      titleKey: 'blogPost2Title',
      excerptKey: 'blogPost2Excerpt',
      dateKey: 'blogPost2Date',
      contentKey: 'blogPost2Content',
      readTime: 8,
    },
    "future-conversational-ai": {
      titleKey: 'blogPost3Title',
      excerptKey: 'blogPost3Excerpt',
      dateKey: 'blogPost3Date',
      contentKey: 'blogPost3Content',
      readTime: 6,
    },
  };

  const config = postConfig[slug];

  if (!config) {
    notFound();
  }

  const post = {
    title: t(config.titleKey as any),
    excerpt: t(config.excerptKey as any),
    date: t(config.dateKey as any),
    readTime: `${config.readTime} ${t('blogMinRead')}`,
    content: t(config.contentKey as any),
  };

  return (
    <div className="min-h-screen bg-background py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto">
          {/* Back link */}
          <Link
            href="/blog"
            className="text-primary hover:underline mb-8 inline-block"
          >
            {t('blogBackToBlog')}
          </Link>

          {/* Article header */}
          <article className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-sm">
            <h1 className="text-3xl sm:text-4xl font-bold mb-4">
              {post.title}
            </h1>

            <div className="flex items-center text-sm text-muted-foreground mb-8 pb-8 border-b">
              <span>{post.date}</span>
              <span className="mx-2">•</span>
              <span>{post.readTime}</span>
            </div>

            {/* Article content */}
            <div className="prose prose-lg dark:prose-invert max-w-none">
              {post.content.split('\n').map((paragraph, index) => {
                if (paragraph.startsWith('## ')) {
                  return (
                    <h2 key={index} className="text-2xl font-bold mt-8 mb-4">
                      {paragraph.replace('## ', '')}
                    </h2>
                  )
                }
                if (paragraph.startsWith('### ')) {
                  return (
                    <h3 key={index} className="text-xl font-semibold mt-6 mb-3">
                      {paragraph.replace('### ', '')}
                    </h3>
                  )
                }
                if (paragraph.startsWith('- ')) {
                  return (
                    <li key={index} className="ml-4 text-muted-foreground">
                      {paragraph.replace('- ', '')}
                    </li>
                  )
                }
                if (paragraph.startsWith('1. ') || paragraph.startsWith('2. ') || paragraph.startsWith('3. ') || paragraph.startsWith('4. ') || paragraph.startsWith('5. ')) {
                  return (
                    <li key={index} className="ml-4 text-muted-foreground list-decimal">
                      {paragraph.replace(/^\d\.\s/, '')}
                    </li>
                  )
                }
                if (paragraph.startsWith('**') && paragraph.endsWith('**')) {
                  return (
                    <p key={index} className="font-semibold my-2">
                      {paragraph.replace(/\*\*/g, '')}
                    </p>
                  )
                }
                if (paragraph.trim() === '') {
                  return null
                }
                return (
                  <p key={index} className="text-muted-foreground my-4">
                    {paragraph}
                  </p>
                )
              })}
            </div>

            {/* CTA */}
            <div className="mt-12 pt-8 border-t">
              <div className="bg-primary/5 rounded-lg p-6 text-center">
                <h3 className="text-xl font-semibold mb-2">
                  {t('blogReadyToStart')}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {t('blogTransformCTA')}
                </p>
                <Link
                  href="/register"
                  className="inline-block bg-primary text-white px-6 py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors"
                >
                  {t('blogStartFreeTrial')}
                </Link>
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  )
}
