import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Use Cases - WhatsApp AI for Every Industry",
  description: "Discover how businesses across e-commerce, real estate, restaurants, and more use WazeApp to automate WhatsApp communication and boost sales.",
  keywords: ["WhatsApp AI use cases", "e-commerce chatbot", "real estate automation", "restaurant WhatsApp bot", "industry solutions"],
  openGraph: {
    title: "WazeApp Use Cases - Solutions for Every Industry",
    description: "See how e-commerce, real estate, restaurants and more transform their business with WhatsApp AI.",
    url: "https://wazeapp.ai/use-cases",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "WazeApp Use Cases" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "WazeApp Use Cases - Industry Solutions",
    description: "WhatsApp AI solutions for e-commerce, real estate, restaurants, and more.",
  },
  alternates: {
    canonical: "/use-cases",
  },
}

export default function UseCasesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
