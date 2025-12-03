import { Metadata } from "next"

export const metadata: Metadata = {
  title: "About WazeApp - WhatsApp AI Assistant",
  description: "Learn about WazeApp's mission to transform business communication through AI-powered WhatsApp automation.",
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-center mb-8">About WazeApp</h1>
          <div className="prose prose-lg mx-auto dark:prose-invert">
            <p>
              WazeApp is revolutionizing business communication by making AI-powered WhatsApp automation 
              accessible to businesses of all sizes. Founded in 2024, our mission is to help businesses 
              provide exceptional customer experiences 24/7.
            </p>
            <h2>Our Mission</h2>
            <p>
              To democratize AI-powered customer communication, making it simple for any business 
              to provide instant, intelligent responses to their customers on WhatsApp.
            </p>
            <h2>Why WhatsApp?</h2>
            <p>
              With over 2 billion users worldwide, WhatsApp is where your customers already are. 
              We believe every business should be able to leverage this powerful platform with AI assistance.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}