export const dynamic = 'force-static';

import { Metadata } from "next"
import Link from "next/link"
import { Mail, Phone, MapPin, Clock, HelpCircle, MessageSquare, ArrowRight, Headphones } from "lucide-react"

export const metadata: Metadata = {
  title: "Contact WazeApp - Get in Touch With Our Team",
  description:
    "Contact the WazeApp team for technical support, sales inquiries, or partnership opportunities. We typically respond within 24 hours.",
  alternates: {
    canonical: "/contact",
  },
  openGraph: {
    title: "Contact WazeApp - Get in Touch With Our Team",
    description:
      "Reach our support, sales, or partnerships team. We are here to help you succeed with AI-powered WhatsApp automation.",
    url: "/contact",
    type: "website",
  },
}

const contactCards = [
  {
    icon: Headphones,
    title: "Technical Support",
    description:
      "Having trouble with your WhatsApp AI agent, knowledge base, or account settings? Our support team is ready to help you resolve any technical issues quickly.",
    email: "support@wazeapp.ai",
    responseTime: "Under 24 hours",
  },
  {
    icon: MessageSquare,
    title: "Sales Inquiries",
    description:
      "Interested in learning how WazeApp can transform your business communication? Reach out to discuss custom plans, volume pricing, or enterprise solutions tailored to your needs.",
    email: "sales@wazeapp.ai",
    responseTime: "Under 12 hours",
  },
  {
    icon: Mail,
    title: "Partnerships",
    description:
      "We are always looking for strategic partners, resellers, and integration collaborators. If you want to build something great together, let us start a conversation.",
    email: "partners@wazeapp.ai",
    responseTime: "Within 2 business days",
  },
]

const faqs = [
  {
    question: "How quickly will I receive a response?",
    answer:
      "Our support team typically responds within 24 hours on business days. Sales inquiries often receive a reply within 12 hours. For urgent production issues, customers on our Pro or Enterprise plans receive priority support with faster turnaround times.",
  },
  {
    question: "What are your support hours?",
    answer:
      "Our team is available Monday through Friday, 8:00 AM to 6:00 PM (WAT / GMT+1). Outside of those hours, you can still send us an email and we will get back to you the next business day. Self-service resources are available 24/7 on our platform.",
  },
  {
    question: "Do you offer live demos or onboarding calls?",
    answer:
      "Yes. If you are evaluating WazeApp for your team or organization, our sales team can schedule a personalized demo to walk you through the platform, answer questions, and help you choose the right plan. Just email sales@wazeapp.ai with your preferred time slots.",
  },
  {
    question: "Where can I find documentation and self-service help?",
    answer:
      "You can explore our features page for a detailed overview of everything WazeApp offers. For pricing details and plan comparisons, visit our pricing page. Once you create an account, the dashboard also includes contextual help and guided setup wizards.",
  },
]

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="py-20 lg:py-28">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Contact Us</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Whether you need help setting up your first AI WhatsApp agent,
              want to explore enterprise options, or are interested in partnering
              with us, our team is here for you. Choose the channel that fits
              your needs and we will get back to you promptly.
            </p>
          </div>
        </div>
      </section>

      {/* Contact Cards */}
      <section className="pb-16">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {contactCards.map((card) => (
              <div
                key={card.title}
                className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-lg hover:shadow-xl transition-shadow"
              >
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-6">
                  <card.icon className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-xl font-semibold mb-3">{card.title}</h2>
                <p className="text-muted-foreground mb-4 text-sm leading-relaxed">
                  {card.description}
                </p>
                <a
                  href={`mailto:${card.email}`}
                  className="text-primary font-medium hover:underline inline-flex items-center gap-1"
                >
                  <Mail className="w-4 h-4" />
                  {card.email}
                </a>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Typical response: {card.responseTime}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Additional Contact Info */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12">
            <div>
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <MapPin className="w-6 h-6 text-primary" />
                Office Location
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                WazeApp operates as a distributed team with contributors across
                Africa and Europe. Our primary operations are based in Cameroon,
                where we serve businesses looking to automate their WhatsApp
                customer communication with intelligent AI agents.
              </p>
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Phone className="w-6 h-6 text-primary" />
                Prefer a Call?
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                If you would rather speak with someone directly, send a brief
                email to{" "}
                <a
                  href="mailto:sales@wazeapp.ai"
                  className="text-primary hover:underline"
                >
                  sales@wazeapp.ai
                </a>{" "}
                describing your needs and preferred time zone. Our team will
                schedule a call at a time that works for you. We also offer live
                product demos for teams evaluating the platform.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-10 flex items-center justify-center gap-2">
              <HelpCircle className="w-7 h-7 text-primary" />
              Frequently Asked Questions
            </h2>
            <div className="space-y-6">
              {faqs.map((faq) => (
                <div
                  key={faq.question}
                  className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow"
                >
                  <h3 className="text-lg font-semibold mb-2">{faq.question}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-center text-sm text-muted-foreground mt-8">
              Still have questions? Check out our{" "}
              <Link href="/features" className="text-primary hover:underline">
                features overview
              </Link>{" "}
              or{" "}
              <Link href="/pricing" className="text-primary hover:underline">
                pricing plans
              </Link>{" "}
              for more details.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary/5">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Create your free account today and launch your first AI-powered
              WhatsApp agent in minutes. No credit card required. If you need
              help choosing the right plan, our sales team is just an email away.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
              >
                Create Free Account
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-input bg-background px-6 py-3 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                View Pricing Plans
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
