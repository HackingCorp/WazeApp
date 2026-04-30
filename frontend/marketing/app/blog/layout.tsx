import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Blog - WhatsApp AI Insights & Tips",
  description: "Stay updated with the latest WhatsApp AI trends, business automation tips, and customer engagement strategies. Expert insights from the WazeApp team.",
  keywords: ["WhatsApp AI blog", "chatbot tips", "business automation insights", "customer engagement strategies", "AI communication"],
  openGraph: {
    title: "WazeApp Blog - WhatsApp AI Insights",
    description: "Expert tips and insights on WhatsApp automation and AI-powered customer engagement.",
    url: "https://wazeapp.ai/blog",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "WazeApp Blog" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "WazeApp Blog - AI & Automation Insights",
    description: "Latest trends in WhatsApp AI and business automation.",
  },
  alternates: {
    canonical: "/blog",
  },
}

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
