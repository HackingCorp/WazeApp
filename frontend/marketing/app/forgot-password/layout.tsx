import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Reset Password - WazeApp",
  description: "Reset your WazeApp account password. Enter your email to receive a password reset link.",
  robots: {
    index: false,
    follow: true,
  },
  openGraph: {
    title: "Reset Your WazeApp Password",
    description: "Recover access to your WhatsApp AI dashboard.",
    url: "https://wazeapp.xyz/forgot-password",
  },
  alternates: {
    canonical: "/forgot-password",
  },
}

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
