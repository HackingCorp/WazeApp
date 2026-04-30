import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Verify Email - WazeApp",
  description: "Verify your email address to complete your WazeApp registration.",
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: "Verify Your Email - WazeApp",
    description: "Complete your registration by verifying your email.",
    url: "https://wazeapp.ai/verify-email",
  },
}

export default function VerifyEmailLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
