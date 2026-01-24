import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Sign Up - Create Your Free WazeApp Account",
  description: "Create your free WazeApp account and start automating your WhatsApp communication with AI. No credit card required.",
  keywords: ["WhatsApp AI signup", "create chatbot account", "free WhatsApp automation", "AI assistant registration"],
  openGraph: {
    title: "Sign Up for WazeApp - Start Free",
    description: "Create your free account and transform your WhatsApp communication with AI.",
    url: "https://wazeapp.xyz/register",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Sign Up for WazeApp" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sign Up for WazeApp",
    description: "Create your free WhatsApp AI account today.",
  },
  alternates: {
    canonical: "/register",
  },
}

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
