"use client"

import { useEffect } from "react"

export default function DashboardRedirect() {
  useEffect(() => {
    // Redirection vers le dashboard principal
    const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3101'
    window.location.href = dashboardUrl
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <h2 className="text-xl font-semibold mb-2">Redirecting to WazeApp Dashboard</h2>
        <p className="text-muted-foreground">
          You are being redirected to the main dashboard...
        </p>
        <div className="mt-6 space-y-2">
          <div>
            <a 
              href={process.env.NEXT_PUBLIC_DASHBOARD_URL || 'http://localhost:3101'} 
              className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Go to Dashboard
            </a>
          </div>
          <div>
            <a 
              href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3103/api/v1'}/docs`} 
              className="inline-block px-4 py-2 border border-primary text-primary rounded-lg hover:bg-primary/10 transition-colors"
            >
              API Documentation
            </a>
          </div>
          <div>
            <a 
              href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3103/api/v1'}/health`} 
              className="inline-block px-4 py-2 border border-green-500 text-green-600 rounded-lg hover:bg-green-50 transition-colors"
            >
              Health Status
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}