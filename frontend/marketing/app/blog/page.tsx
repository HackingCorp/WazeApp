import { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Blog - WazeApp WhatsApp AI Insights",
  description: "Latest insights, tips, and updates about WhatsApp AI automation and business communication.",
}

const blogPosts = [
  {
    title: "5 Ways WhatsApp AI Can Transform Your Customer Service",
    excerpt: "Discover how AI-powered WhatsApp automation can reduce response times and improve customer satisfaction.",
    date: "January 15, 2025",
    readTime: "5 min read",
    slug: "transform-customer-service",
  },
  {
    title: "Getting Started with WhatsApp Business API",
    excerpt: "A comprehensive guide to setting up and optimizing your WhatsApp Business API for maximum engagement.",
    date: "January 10, 2025",
    readTime: "8 min read",
    slug: "whatsapp-business-api-guide",
  },
  {
    title: "The Future of Conversational AI in Business",
    excerpt: "Explore upcoming trends in conversational AI and how they'll shape business communication in 2025.",
    date: "January 5, 2025",
    readTime: "6 min read",
    slug: "future-conversational-ai",
  },
]

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-background py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-center mb-12">WazeApp Blog</h1>
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
                  Read more →
                </Link>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}