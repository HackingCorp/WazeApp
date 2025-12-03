"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { MessageSquare, Settings, Zap, ArrowRight, CheckCircle } from "lucide-react"

const steps = [
  {
    number: "01",
    title: "Connect Your WhatsApp",
    description: "Scan a QR code to connect your WhatsApp Business account to WazeApp. Takes less than 30 seconds.",
    icon: MessageSquare,
    details: [
      "No phone installation required",
      "Works with WhatsApp Business",
      "Secure connection via QR code",
      "Multi-device support",
    ],
  },
  {
    number: "02",
    title: "Configure Your AI Assistant",
    description: "Set up your bot's personality, responses, and business rules. Upload your knowledge base and customize responses.",
    icon: Settings,
    details: [
      "Custom personality setup",
      "Knowledge base integration",
      "Business rules configuration",
      "Brand voice customization",
    ],
  },
  {
    number: "03",
    title: "Start Automating",
    description: "Your AI assistant is now live! It will handle customer queries 24/7 while learning from every interaction.",
    icon: Zap,
    details: [
      "24/7 automated responses",
      "Continuous learning",
      "Human handoff when needed",
      "Real-time analytics",
    ],
  },
]

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-to-b from-green-50 to-white dark:from-green-950/20 dark:to-background py-20 sm:py-32">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6">
                Get Started in
                <span className="text-primary"> 3 Simple Steps</span>
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
                Setting up your WhatsApp AI assistant is incredibly simple. 
                From connection to automation in just minutes.
              </p>
              <Link href="/register">
                <Button size="lg">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="py-20 sm:py-32">
        <div className="container mx-auto px-4">
          <div className="space-y-24">
            {steps.map((step, index) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.2 }}
                className={`grid lg:grid-cols-2 gap-12 items-center ${
                  index % 2 === 1 ? "lg:grid-flow-col-dense" : ""
                }`}
              >
                <div className={index % 2 === 1 ? "lg:col-start-2" : ""}>
                  <div className="flex items-center mb-6">
                    <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mr-6">
                      <span className="text-2xl font-bold text-primary">{step.number}</span>
                    </div>
                    <div>
                      <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                        {step.title}
                      </h2>
                    </div>
                  </div>
                  <p className="text-lg text-muted-foreground mb-8">
                    {step.description}
                  </p>
                  <div className="space-y-3">
                    {step.details.map((detail) => (
                      <div key={detail} className="flex items-center">
                        <CheckCircle className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                        <span className="text-gray-700 dark:text-gray-300">{detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={index % 2 === 1 ? "lg:col-start-1" : ""}>
                  <div className="bg-gradient-to-br from-primary/5 to-primary/20 rounded-2xl p-8 h-80 flex items-center justify-center">
                    <step.icon className="h-32 w-32 text-primary" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-gray-900/50 py-20">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-6">
              Why Choose WazeApp?
            </h2>
            <div className="grid md:grid-cols-3 gap-8 mt-12">
              {[
                {
                  title: "No Technical Skills Required",
                  description: "Simple setup process that anyone can follow. No coding or technical expertise needed.",
                },
                {
                  title: "Instant Results",
                  description: "Start seeing results immediately. Your AI assistant begins working as soon as it's connected.",
                },
                {
                  title: "Scales with Your Business",
                  description: "Whether you're handling 10 or 10,000 conversations, WazeApp grows with your needs.",
                },
              ].map((benefit) => (
                <div key={benefit.title} className="bg-white dark:bg-gray-800 rounded-xl p-6">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                    {benefit.title}
                  </h3>
                  <p className="text-muted-foreground">{benefit.description}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      <div className="bg-primary text-white py-20">
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">
              Ready to Get Started?
            </h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto">
              Join thousands of businesses already using WazeApp to transform their customer communication.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register">
                <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                  Start Free Trial
                </Button>
              </Link>
              <Link href="#demo">
                <Button size="lg" variant="outline" className="w-full sm:w-auto border-white text-white hover:bg-white hover:text-primary">
                  Try Demo
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}