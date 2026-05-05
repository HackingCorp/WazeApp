import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Pricing - Affordable Plans for Every Business",
  description: "Choose the perfect WazeApp plan for your business. From free starter to enterprise solutions. Transparent pricing with no hidden fees.",
  keywords: ["WhatsApp AI pricing", "chatbot plans", "business messaging cost", "AI assistant pricing", "WhatsApp automation cost"],
  openGraph: {
    title: "WazeApp Pricing - Plans for Every Business Size",
    description: "Affordable AI-powered WhatsApp solutions. Start free, scale as you grow.",
    url: "https://wazeapp.ai/pricing",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "WazeApp Pricing" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "WazeApp Pricing - Affordable WhatsApp AI Plans",
    description: "Start free, upgrade anytime. Transparent pricing for businesses of all sizes.",
  },
  alternates: {
    canonical: "/pricing",
  },
}

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Can I change plans anytime?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.",
      },
    },
    {
      "@type": "Question",
      name: "What happens if I exceed my message limit?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "You'll be notified when you reach 80% of your limit. You can upgrade your plan or purchase additional messages.",
      },
    },
    {
      "@type": "Question",
      name: "Is there a setup fee?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No, there are no setup fees. You can start using WazeApp immediately after signing up.",
      },
    },
    {
      "@type": "Question",
      name: "Do you offer refunds?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "We offer a 14-day money-back guarantee for all paid plans. No questions asked.",
      },
    },
    {
      "@type": "Question",
      name: "Can I use multiple WhatsApp numbers?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes, each agent represents one WhatsApp number. You can add more agents based on your plan.",
      },
    },
    {
      "@type": "Question",
      name: "What payment methods do you accept?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "We accept all major credit cards, PayPal, and bank transfers for enterprise customers.",
      },
    },
  ],
}

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {children}
    </>
  )
}
