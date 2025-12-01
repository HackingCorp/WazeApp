"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { ShoppingCart, Home, Utensils, ArrowRight } from "lucide-react"

const useCases = [
  {
    title: "E-commerce",
    description: "Automate order tracking, product inquiries, and customer support for your online store.",
    icon: ShoppingCart,
    benefits: [
      "Automated order status updates",
      "Product recommendations",
      "Cart abandonment recovery",
      "24/7 customer support",
    ],
    stats: {
      improvement: "35% increase in conversion rate",
      time: "Save 20+ hours per week",
    },
  },
  {
    title: "Real Estate",
    description: "Handle property inquiries, schedule viewings, and provide instant information to potential buyers.",
    icon: Home,
    benefits: [
      "Property inquiry responses",
      "Automated viewing scheduling",
      "Market information sharing",
      "Lead qualification",
    ],
    stats: {
      improvement: "50% more qualified leads",
      time: "Reduce response time to 30 seconds",
    },
  },
  {
    title: "Restaurants",
    description: "Take orders, handle reservations, and provide menu information through WhatsApp.",
    icon: Utensils,
    benefits: [
      "WhatsApp order taking",
      "Table reservations",
      "Menu sharing and updates",
      "Delivery status updates",
    ],
    stats: {
      improvement: "40% increase in delivery orders",
      time: "Process orders 5x faster",
    },
  },
]

export default function UseCasesPage() {
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
                Perfect for Every
                <span className="text-primary"> Business Type</span>
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
                See how businesses across industries are using WizeApp to transform their WhatsApp communication.
              </p>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="py-20 sm:py-32">
        <div className="container mx-auto px-4">
          <div className="space-y-32">
            {useCases.map((useCase, index) => (
              <motion.div
                key={useCase.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className={`grid lg:grid-cols-2 gap-12 items-center ${
                  index % 2 === 1 ? "lg:grid-flow-col-dense" : ""
                }`}
              >
                <div className={index % 2 === 1 ? "lg:col-start-2" : ""}>
                  <div className="flex items-center mb-6">
                    <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mr-6">
                      <useCase.icon className="h-8 w-8 text-primary" />
                    </div>
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                      {useCase.title}
                    </h2>
                  </div>
                  <p className="text-lg text-muted-foreground mb-8">
                    {useCase.description}
                  </p>
                  
                  <div className="space-y-3 mb-8">
                    {useCase.benefits.map((benefit) => (
                      <div key={benefit} className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-primary mr-3"></div>
                        <span className="text-gray-700 dark:text-gray-300">{benefit}</span>
                      </div>
                    ))}
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 mb-8">
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Results</p>
                        <p className="text-lg font-semibold text-green-600">{useCase.stats.improvement}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Efficiency</p>
                        <p className="text-lg font-semibold text-primary">{useCase.stats.time}</p>
                      </div>
                    </div>
                  </div>

                  <Link href="/register">
                    <Button size="lg">
                      Get Started
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
                
                <div className={index % 2 === 1 ? "lg:col-start-1" : ""}>
                  <div className="bg-gradient-to-br from-primary/5 to-primary/20 rounded-2xl p-8 h-80 flex items-center justify-center">
                    <useCase.icon className="h-32 w-32 text-primary/40" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
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
              Ready to Transform Your Business?
            </h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto">
              Join thousands of businesses already using WizeApp to automate their WhatsApp communication.
            </p>
            <Link href="/register">
              <Button size="lg" variant="secondary">
                Start Free Trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </div>
    </div>
  )
}