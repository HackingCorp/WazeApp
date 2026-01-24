import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Dashboard Redirect - WazeApp",
  description: "Access your WazeApp dashboard to manage AI WhatsApp agents.",
  robots: {
    index: false,
    follow: false,
  },
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="dashboard-layout">
      {children}
    </div>
  )
}