import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Login - Access Your WazeApp Dashboard",
  description: "Sign in to your WazeApp account to manage your WhatsApp AI agents, view analytics, and handle customer conversations.",
  robots: {
    index: false,
    follow: true,
  },
  openGraph: {
    title: "Login to WazeApp",
    description: "Access your WhatsApp AI dashboard.",
    url: "https://wazeapp.xyz/login",
  },
  alternates: {
    canonical: "/login",
  },
}

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
