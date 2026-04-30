import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Features - Powerful WhatsApp AI Capabilities",
  description: "Discover WazeApp's powerful features: 24/7 AI responses, 95+ languages support, rich media handling, team collaboration, advanced analytics, and enterprise security.",
  keywords: ["WhatsApp AI features", "chatbot capabilities", "multilingual support", "business automation", "customer support AI"],
  openGraph: {
    title: "WazeApp Features - Transform Your WhatsApp Communication",
    description: "24/7 AI responses, 95+ languages, rich media support, team collaboration, and enterprise-grade security.",
    url: "https://wazeapp.ai/features",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "WazeApp Features" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "WazeApp Features - WhatsApp AI Capabilities",
    description: "Discover powerful AI features for your WhatsApp business communication.",
  },
  alternates: {
    canonical: "/features",
  },
}

export default function FeaturesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
