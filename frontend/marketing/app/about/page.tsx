export const dynamic = 'force-static';

import { Metadata } from "next"
import Link from "next/link"
import {
  MessageSquare,
  Globe2,
  Zap,
  Shield,
  Heart,
  Users,
  BookOpen,
  BarChart3,
  ArrowRight,
  Target,
  Lightbulb,
  Handshake,
  MapPin,
} from "lucide-react"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "About WazeApp - AI-Powered WhatsApp Automation Platform",
  description:
    "Learn about WazeApp, the AI-powered WhatsApp automation platform built in Africa for the world. Discover our mission, values, and how we help businesses deliver exceptional customer experiences 24/7.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About WazeApp - AI-Powered WhatsApp Automation Platform",
    description:
      "Learn about WazeApp, the AI-powered WhatsApp automation platform built in Africa for the world. Discover our mission, values, and how we help businesses deliver exceptional customer experiences 24/7.",
    url: "https://wazeapp.ai/about",
    siteName: "WazeApp",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "About WazeApp - AI-Powered WhatsApp Automation Platform",
    description:
      "Learn about WazeApp, the AI-powered WhatsApp automation platform built in Africa for the world.",
  },
}

const values = [
  {
    icon: Lightbulb,
    title: "Innovation First",
    description:
      "We push the boundaries of what AI can do for business communication. By integrating multiple large language models, vision capabilities, and voice transcription, we deliver intelligent automation that continuously learns and improves.",
  },
  {
    icon: Heart,
    title: "Customer Obsession",
    description:
      "Every feature we build starts with a real customer need. We listen to the businesses that rely on WazeApp daily and shape our roadmap around the challenges they face -- from handling after-hours inquiries to managing high-volume campaigns.",
  },
  {
    icon: Handshake,
    title: "Accessibility and Inclusion",
    description:
      "Great technology should be available to everyone. We offer flexible pricing in local currencies like XAF and XOF, support over 95 languages, and design our platform so that teams of any size can get started without technical expertise.",
  },
  {
    icon: Shield,
    title: "Trust and Security",
    description:
      "Businesses entrust us with their customer conversations. We take that responsibility seriously with end-to-end encryption, strict data handling policies, and transparent practices that meet international compliance standards.",
  },
]

const features = [
  {
    icon: MessageSquare,
    title: "AI-Powered WhatsApp Agents",
    description:
      "Create intelligent chatbots that understand context, remember conversation history, and respond naturally in your brand voice.",
  },
  {
    icon: BookOpen,
    title: "Knowledge Base with Vector Search",
    description:
      "Upload documents, FAQs, and product catalogs. Our vector search engine ensures your AI agent always finds the most relevant answer.",
  },
  {
    icon: Globe2,
    title: "Multilingual Support for 95+ Languages",
    description:
      "Serve customers across the globe with real-time translation and culturally aware responses -- no manual translation required.",
  },
  {
    icon: BarChart3,
    title: "Real-Time Analytics and Insights",
    description:
      "Track response times, satisfaction scores, conversation volumes, and conversion rates with a comprehensive analytics dashboard.",
  },
  {
    icon: Users,
    title: "Team Collaboration and Escalation",
    description:
      "When conversations need a human touch, smart escalation routes them to the right team member with full context intact.",
  },
  {
    icon: Zap,
    title: "Sub-Second Response Times",
    description:
      "Your customers get answers in under 0.3 seconds on average, ensuring they never wait and never leave the conversation.",
  },
]

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="bg-gradient-to-b from-green-50 to-white dark:from-green-950/20 dark:to-background py-20 sm:py-32">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6">
              Transforming Business Communication
              <span className="text-primary"> with AI</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
              WazeApp is an AI-powered WhatsApp automation platform that helps
              businesses of all sizes deliver instant, intelligent, and
              personalized customer experiences around the clock. Founded in 2024,
              we are on a mission to make world-class conversational AI accessible
              to every entrepreneur and enterprise.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register">
                <Button size="lg">
                  Get Started Free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/how-it-works">
                <Button size="lg" variant="outline">
                  See How It Works
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Our Mission Section */}
      <div className="py-20 sm:py-28">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-center mb-6">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Target className="h-6 w-6 text-primary" />
              </div>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white text-center mb-8">
              Our Mission
            </h2>
            <div className="prose prose-lg mx-auto dark:prose-invert">
              <p>
                Our mission is to democratize AI-powered customer communication.
                We believe that every business -- whether a one-person shop in
                Douala or a growing enterprise in Lagos -- deserves the same
                quality of automated support that was once reserved for
                well-funded tech companies. By combining the reach of WhatsApp
                with the intelligence of modern AI, WazeApp makes it simple for
                any organization to provide instant, accurate, and helpful
                responses to its customers at any hour of the day.
              </p>
              <p>
                We built WazeApp because we saw a gap: billions of people
                communicate on WhatsApp every day, yet most businesses still rely
                on slow, manual processes to manage those conversations. Our
                platform bridges that gap with intelligent agents that understand
                context, speak multiple languages, and learn from every
                interaction. The result is faster response times, higher customer
                satisfaction, and more revenue for the businesses that trust us.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Why WhatsApp Section */}
      <div className="bg-gray-50 dark:bg-gray-900/50 py-20 sm:py-28">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white text-center mb-8">
              Why WhatsApp?
            </h2>
            <div className="prose prose-lg mx-auto dark:prose-invert mb-12">
              <p>
                WhatsApp is not just a messaging app -- it is the primary
                communication channel for over 2 billion users across more than
                180 countries. In Africa, South Asia, Latin America, and many
                parts of Europe, WhatsApp is how people contact businesses, ask
                questions, place orders, and resolve issues. Customers do not want
                to download new apps, navigate complex websites, or wait on hold.
                They want to send a message and get an answer.
              </p>
              <p>
                That is exactly what WazeApp enables. By meeting customers on the
                platform they already use and trust, businesses remove friction
                from the entire customer journey. Our{" "}
                <Link href="/features" className="text-primary hover:underline">
                  AI-powered features
                </Link>{" "}
                handle everything from answering frequently asked questions and
                processing orders to sending broadcast campaigns and analyzing
                customer sentiment -- all within WhatsApp.
              </p>
            </div>
            <div className="grid sm:grid-cols-3 gap-8">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 text-center shadow-sm">
                <p className="text-4xl font-bold text-primary mb-2">2B+</p>
                <p className="text-muted-foreground">Active WhatsApp users worldwide</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 text-center shadow-sm">
                <p className="text-4xl font-bold text-primary mb-2">180+</p>
                <p className="text-muted-foreground">Countries where WhatsApp is used daily</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 text-center shadow-sm">
                <p className="text-4xl font-bold text-primary mb-2">98%</p>
                <p className="text-muted-foreground">Average message open rate on WhatsApp</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* What We Offer Section */}
      <div className="py-20 sm:py-28">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white text-center mb-4">
              What We Offer
            </h2>
            <p className="text-lg text-muted-foreground text-center max-w-3xl mx-auto mb-12">
              WazeApp is a complete platform for automating and managing your
              WhatsApp business conversations. Explore all capabilities on our{" "}
              <Link href="/features" className="text-primary hover:underline">
                features page
              </Link>
              .
            </p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700"
                >
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>
            <div className="text-center mt-10">
              <Link href="/use-cases">
                <Button variant="outline" size="lg">
                  See Use Cases
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Our Values Section */}
      <div className="bg-gray-50 dark:bg-gray-900/50 py-20 sm:py-28">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white text-center mb-4">
              Our Values
            </h2>
            <p className="text-lg text-muted-foreground text-center max-w-3xl mx-auto mb-12">
              These principles guide every decision we make, from the code we
              write to the customers we serve.
            </p>
            <div className="grid md:grid-cols-2 gap-8">
              {values.map((value) => (
                <div
                  key={value.title}
                  className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-sm"
                >
                  <div className="flex items-center mb-4">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mr-4">
                      <value.icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                      {value.title}
                    </h3>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    {value.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Built for Africa Section */}
      <div className="py-20 sm:py-28">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-center mb-6">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <MapPin className="h-6 w-6 text-primary" />
              </div>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white text-center mb-8">
              Built for Africa, Serving the World
            </h2>
            <div className="prose prose-lg mx-auto dark:prose-invert">
              <p>
                WazeApp was born in Africa, where WhatsApp is not merely a
                convenience but a lifeline for commerce. Across Central and West
                Africa, millions of entrepreneurs run their businesses through
                WhatsApp conversations -- selling products, booking appointments,
                and handling customer support. We understand these markets because
                we are part of them.
              </p>
              <p>
                That is why WazeApp supports local payment methods, displays{" "}
                <Link href="/pricing" className="text-primary hover:underline">
                  pricing
                </Link>{" "}
                in XAF, XOF, and other regional currencies, and optimizes
                performance for the connectivity conditions common across the
                continent. We integrate with Mobile Money providers including MTN
                and Orange so that subscribing to WazeApp is as simple as sending
                a mobile payment.
              </p>
              <p>
                At the same time, our platform is designed for global scale. With
                multilingual AI that handles over 95 languages, infrastructure
                that delivers sub-second response times, and integrations that
                connect to CRMs, e-commerce platforms, and analytics tools
                worldwide, WazeApp serves businesses from Cameroon to Canada, from
                Senegal to Singapore. No matter where your customers are, WazeApp
                ensures they get a fast, intelligent, and helpful response.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-primary text-white py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">
            Ready to Transform Your Customer Communication?
          </h2>
          <p className="text-xl mb-8 max-w-2xl mx-auto">
            Join businesses around the world that use WazeApp to automate
            conversations, delight customers, and grow revenue on WhatsApp.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button
                size="lg"
                variant="secondary"
                className="w-full sm:w-auto"
              >
                Start Your Free Trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/contact">
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto border-white text-white bg-transparent hover:bg-white hover:text-primary"
              >
                Contact Our Team
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
