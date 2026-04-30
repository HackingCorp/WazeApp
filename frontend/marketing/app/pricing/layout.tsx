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

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
