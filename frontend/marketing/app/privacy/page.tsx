import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Policy - WizeApp",
  description: "WizeApp's privacy policy explaining how we collect, use, and protect your data.",
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
          <div className="prose prose-lg mx-auto dark:prose-invert">
            <p className="text-muted-foreground">Last updated: January 2025</p>
            
            <h2>Information We Collect</h2>
            <p>We collect information you provide directly to us, such as when you create an account, use our services, or contact us for support.</p>
            
            <h2>How We Use Your Information</h2>
            <p>We use the information we collect to provide, maintain, and improve our services, process transactions, and communicate with you.</p>
            
            <h2>Data Security</h2>
            <p>We implement appropriate technical and organizational measures to protect your personal data against unauthorized access, alteration, disclosure, or destruction.</p>
            
            <h2>Contact Us</h2>
            <p>If you have any questions about this Privacy Policy, please contact us at privacy@wizeapp.com.</p>
          </div>
        </div>
      </div>
    </div>
  )
}