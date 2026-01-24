import { Metadata } from "next"

export const metadata: Metadata = {
  title: "How It Works - Get Started in 3 Simple Steps",
  description: "Learn how to set up your WhatsApp AI assistant in minutes. Connect your WhatsApp, configure your AI agent, and start automating customer conversations.",
  keywords: ["WhatsApp AI setup", "chatbot configuration", "AI assistant guide", "WhatsApp automation tutorial", "business messaging setup"],
  openGraph: {
    title: "How WazeApp Works - Simple 3-Step Setup",
    description: "Connect WhatsApp, configure AI, start automating. It's that simple.",
    url: "https://wazeapp.xyz/how-it-works",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "How WazeApp Works" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "How WazeApp Works - Easy WhatsApp AI Setup",
    description: "Set up your AI-powered WhatsApp assistant in just 3 steps.",
  },
  alternates: {
    canonical: "/how-it-works",
  },
}

export default function HowItWorksLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
