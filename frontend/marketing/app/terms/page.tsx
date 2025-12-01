import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Terms of Service - WizeApp",
  description: "WizeApp's terms of service governing the use of our WhatsApp AI automation platform.",
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
          <div className="prose prose-lg mx-auto dark:prose-invert">
            <p className="text-muted-foreground">Last updated: January 2025</p>
            
            <h2>Acceptance of Terms</h2>
            <p>By accessing and using WizeApp, you accept and agree to be bound by the terms and provision of this agreement.</p>
            
            <h2>Use License</h2>
            <p>Permission is granted to temporarily use WizeApp for personal, non-commercial transitory viewing only under the terms of our subscription plans.</p>
            
            <h2>Service Availability</h2>
            <p>We strive to provide 99.9% uptime but do not guarantee uninterrupted service. We reserve the right to modify or discontinue the service at any time.</p>
            
            <h2>User Responsibilities</h2>
            <p>You are responsible for maintaining the confidentiality of your account and for all activities that occur under your account.</p>
            
            <h2>Contact Information</h2>
            <p>Questions about the Terms of Service should be sent to legal@wizeapp.com.</p>
          </div>
        </div>
      </div>
    </div>
  )
}