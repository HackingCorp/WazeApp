'use client';

import Link from "next/link"
import { notFound, useParams } from "next/navigation"
import { useTranslations } from "@/lib/hooks/use-translations"

// Blog posts data - content stays in English as articles
const blogPostsContent: Record<string, {
  content: string
}> = {
  "transform-customer-service": {
    content: `
## Introduction

In today's fast-paced digital world, customer expectations are higher than ever. They want instant responses, 24/7 availability, and personalized interactions. WhatsApp AI is revolutionizing how businesses meet these demands.

## 1. Instant Response Times

With AI-powered WhatsApp automation, your business can respond to customer queries within seconds, not hours. This immediate engagement significantly improves customer satisfaction and reduces abandonment rates.

**Key benefits:**
- 24/7 availability without additional staff
- Consistent response quality
- Reduced wait times from hours to seconds

## 2. Personalized Customer Interactions

AI can analyze customer history and preferences to deliver personalized responses. Each interaction feels tailored to the individual customer, building stronger relationships.

## 3. Seamless Escalation to Human Agents

When complex issues arise, AI can intelligently escalate conversations to human agents with full context, ensuring smooth handoffs and faster resolution.

## 4. Multi-language Support

Break language barriers with AI that can communicate in over 100 languages, expanding your reach to global markets without hiring multilingual staff.

## 5. Data-Driven Insights

AI captures and analyzes every interaction, providing valuable insights into customer behavior, common issues, and opportunities for improvement.

## Conclusion

WhatsApp AI isn't just a trend—it's the future of customer service. Businesses that adopt this technology now will have a significant competitive advantage in the years to come.

Ready to transform your customer service? [Start your free trial](/register) today.
    `
  },
  "whatsapp-business-api-guide": {
    content: `
## What is WhatsApp Business API?

The WhatsApp Business API allows medium and large businesses to communicate with customers at scale. Unlike the WhatsApp Business App, the API enables automation, integration with existing systems, and handling of high message volumes.

## Prerequisites

Before getting started, you'll need:

1. A verified Facebook Business account
2. A phone number dedicated to WhatsApp Business
3. A technical team or platform like WazeApp to handle the integration

## Step 1: Choose Your Integration Method

There are two main approaches:

### Direct API Access
- More control and customization
- Requires technical expertise
- Higher setup complexity

### Business Solution Provider (BSP)
- Faster setup
- Managed infrastructure
- Built-in compliance and support

**WazeApp provides a complete BSP solution**, handling all the technical complexity so you can focus on engaging with your customers.

## Step 2: Set Up Your Business Profile

Your WhatsApp Business profile is your digital storefront. Include:

- Business name and description
- Contact information
- Business hours
- Website link
- Profile picture

## Step 3: Create Message Templates

For outbound messaging, you'll need approved message templates. Tips for approval:

- Keep messages clear and professional
- Include a clear call-to-action
- Avoid promotional language in transactional templates
- Use proper grammar and formatting

## Step 4: Implement AI Automation

With WazeApp, you can:

- Set up AI agents to handle common queries
- Create knowledge bases for accurate responses
- Configure escalation rules for complex issues
- Monitor performance with analytics

## Best Practices

1. **Respect opt-in requirements** - Only message users who have consented
2. **Respond quickly** - Aim for under 5-minute response times
3. **Be helpful, not spammy** - Focus on value, not volume
4. **Use rich media** - Images and documents improve engagement
5. **Track metrics** - Monitor response rates and satisfaction scores

## Conclusion

The WhatsApp Business API is a powerful tool for customer engagement. With the right setup and strategy, you can transform how your business communicates with customers.

[Get started with WazeApp](/register) and have your WhatsApp AI running in minutes.
    `
  },
  "future-conversational-ai": {
    content: `
## The Evolution of Conversational AI

Conversational AI has come a long way from simple chatbots that could only handle basic FAQs. Today's AI assistants can understand context, maintain conversations, and even detect emotions.

## Key Trends for 2025

### 1. Multimodal AI

Future AI won't just understand text—it will seamlessly process:

- Voice messages and audio
- Images and videos
- Documents and files
- Location and context data

WazeApp already supports **audio transcription** and **image analysis**, putting you ahead of the curve.

### 2. Hyper-Personalization

AI will leverage customer data to deliver increasingly personalized experiences:

- Remembering past interactions
- Anticipating customer needs
- Adapting communication style
- Offering proactive support

### 3. Emotional Intelligence

Next-generation AI will better understand and respond to emotional cues:

- Detecting frustration or satisfaction
- Adjusting tone accordingly
- Knowing when to escalate to humans
- Building genuine rapport

### 4. Seamless Human-AI Collaboration

The future isn't AI replacing humans—it's AI augmenting human capabilities:

- AI handles routine tasks
- Humans focus on complex issues
- Smooth handoffs between both
- Continuous learning from human feedback

### 5. Privacy-First Design

As AI becomes more powerful, privacy concerns grow. Future AI will feature:

- On-device processing
- Data minimization
- Transparent AI decisions
- User control over data

## Impact on Business Communication

### Customer Service
- Instant resolution for 80%+ of queries
- Proactive outreach based on behavior
- Consistent quality across all channels

### Sales
- AI-qualified leads
- Personalized product recommendations
- Automated follow-ups

### Marketing
- Conversational campaigns
- Interactive content delivery
- Real-time engagement analytics

## Preparing Your Business

To stay competitive, businesses should:

1. **Start now** - Early adopters gain advantages
2. **Build knowledge bases** - AI is only as good as its training data
3. **Invest in integration** - Connect AI to your existing systems
4. **Monitor and improve** - Continuously refine your AI's performance

## Conclusion

The future of business communication is conversational, intelligent, and available 24/7. Companies that embrace this transformation will thrive; those that don't risk being left behind.

Ready to future-proof your business? [Try WazeApp free](/register) and experience the future today.
    `
  }
}

export default function BlogPostPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const { t } = useTranslations();

  const postContent = blogPostsContent[slug];

  if (!postContent) {
    notFound();
  }

  // Get translated metadata
  const postMeta = {
    "transform-customer-service": {
      title: t('blogPost1Title'),
      excerpt: t('blogPost1Excerpt'),
      date: t('blogPost1Date'),
      readTime: `5 ${t('blogMinRead')}`,
    },
    "whatsapp-business-api-guide": {
      title: t('blogPost2Title'),
      excerpt: t('blogPost2Excerpt'),
      date: t('blogPost2Date'),
      readTime: `8 ${t('blogMinRead')}`,
    },
    "future-conversational-ai": {
      title: t('blogPost3Title'),
      excerpt: t('blogPost3Excerpt'),
      date: t('blogPost3Date'),
      readTime: `6 ${t('blogMinRead')}`,
    },
  }[slug];

  if (!postMeta) {
    notFound();
  }

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
              {postMeta.title}
            </h1>

            <div className="flex items-center text-sm text-muted-foreground mb-8 pb-8 border-b">
              <span>{postMeta.date}</span>
              <span className="mx-2">•</span>
              <span>{postMeta.readTime}</span>
            </div>

            {/* Article content */}
            <div className="prose prose-lg dark:prose-invert max-w-none">
              {postContent.content.split('\n').map((paragraph, index) => {
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
                // Handle links in text
                const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
                if (linkRegex.test(paragraph)) {
                  const parts = paragraph.split(linkRegex)
                  return (
                    <p key={index} className="text-muted-foreground my-4">
                      {paragraph.replace(linkRegex, (match, text, url) => text)}
                      {paragraph.includes('/register') && (
                        <Link href="/register" className="text-primary hover:underline ml-1">
                          {t('blogStartFreeTrial')}
                        </Link>
                      )}
                    </p>
                  )
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
