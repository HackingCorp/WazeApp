'use client';

import Link from "next/link"
import { useTranslations } from "@/lib/hooks/use-translations"

export default function BlogPage() {
  const { t } = useTranslations();

  const blogPosts = [
    {
      title: t('blogPost1Title'),
      excerpt: t('blogPost1Excerpt'),
      date: t('blogPost1Date'),
      readTime: `5 ${t('blogMinRead')}`,
      slug: "transform-customer-service",
    },
    {
      title: t('blogPost2Title'),
      excerpt: t('blogPost2Excerpt'),
      date: t('blogPost2Date'),
      readTime: `8 ${t('blogMinRead')}`,
      slug: "whatsapp-business-api-guide",
    },
    {
      title: t('blogPost3Title'),
      excerpt: t('blogPost3Excerpt'),
      date: t('blogPost3Date'),
      readTime: `6 ${t('blogMinRead')}`,
      slug: "future-conversational-ai",
    },
  ];

  return (
    <div className="min-h-screen bg-background py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-center mb-12">{t('blogTitle')}</h1>
          <div className="grid gap-8">
            {blogPosts.map((post) => (
              <article key={post.slug} className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-sm hover:shadow-lg transition-shadow">
                <h2 className="text-2xl font-bold mb-3">
                  <Link href={`/blog/${post.slug}`} className="hover:text-primary">
                    {post.title}
                  </Link>
                </h2>
                <div className="flex items-center text-sm text-muted-foreground mb-4">
                  <span>{post.date}</span>
                  <span className="mx-2">•</span>
                  <span>{post.readTime}</span>
                </div>
                <p className="text-muted-foreground mb-4">{post.excerpt}</p>
                <Link
                  href={`/blog/${post.slug}`}
                  className="text-primary hover:underline font-medium"
                >
                  {t('blogReadMore')}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
