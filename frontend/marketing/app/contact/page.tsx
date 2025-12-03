import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Contact WazeApp - Get in Touch",
  description: "Contact the WazeApp team for support, sales inquiries, or partnership opportunities.",
}

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-4xl font-bold text-center mb-8">Contact Us</h1>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-lg">
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-2">Support</h2>
                <p className="text-muted-foreground">support@wazeapp.com</p>
              </div>
              <div>
                <h2 className="text-xl font-semibold mb-2">Sales</h2>
                <p className="text-muted-foreground">sales@wazeapp.com</p>
              </div>
              <div>
                <h2 className="text-xl font-semibold mb-2">Partnerships</h2>
                <p className="text-muted-foreground">partners@wazeapp.com</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}