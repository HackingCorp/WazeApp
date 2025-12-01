"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, MessageCircle, Clock, Globe, Zap } from "lucide-react"
import { motion } from "framer-motion"
import { useEffect, useState } from "react"

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-green-50 to-white dark:from-green-950/20 dark:to-background py-20 sm:py-32">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center rounded-full border px-4 py-1.5 text-sm mb-6">
              <span className="mr-2 h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
              <span>Transform your WhatsApp into an AI powerhouse</span>
            </div>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 dark:text-white mb-6">
              Turn WhatsApp into Your
              <span className="text-whatsapp"> AI Assistant</span> in
              <span className="text-primary"> 30 Seconds</span>
            </h1>
            
            <p className="text-lg sm:text-xl text-muted-foreground mb-8">
              Create intelligent WhatsApp agents that handle customer support, sales, 
              and engagement 24/7. No coding required. Start free today.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-12">
              <Link href="/register">
                <Button size="lg" className="w-full sm:w-auto">
                  Connect WhatsApp Now
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="#demo">
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Try Live Demo
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-3 gap-6">
              <div className="flex items-center space-x-2">
                <Clock className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold">0.3s</p>
                  <p className="text-sm text-muted-foreground">Response Time</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Globe className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold">95+</p>
                  <p className="text-sm text-muted-foreground">Languages</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Zap className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold">24/7</p>
                  <p className="text-sm text-muted-foreground">Availability</p>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative"
          >
            <div className="relative mx-auto max-w-md">
              <div className="absolute inset-0 bg-gradient-to-r from-green-400 to-blue-500 rounded-3xl blur-3xl opacity-20 animate-pulse"></div>
              <WhatsAppMockup />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

function WhatsAppMockup() {
  const messages = [
    { type: "user", text: "Hi, I need help with my order #12345" },
    { type: "bot", text: "Hello! I'd be happy to help you with order #12345. Let me check that for you..." },
    { type: "bot", text: "I found your order! It was shipped yesterday and should arrive by tomorrow. Tracking: UPS123456" },
    { type: "user", text: "Great! Can you send me the invoice?" },
    { type: "bot", text: "Of course! I've sent the invoice to your email. Is there anything else I can help you with?" },
  ]

  return (
    <div className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden">
      <div className="bg-whatsapp text-white p-4 flex items-center space-x-3">
        <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
          <span className="text-lg font-bold">AI</span>
        </div>
        <div>
          <p className="font-semibold">WizeApp Assistant</p>
          <p className="text-xs opacity-90">Always online</p>
        </div>
      </div>
      
      <div className="p-4 space-y-3 h-96 overflow-y-auto bg-gray-50 dark:bg-gray-800">
        {messages.map((message, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.2 }}
            className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                message.type === "user"
                  ? "bg-whatsapp text-white"
                  : "bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              }`}
            >
              <p className="text-sm">{message.text}</p>
            </div>
          </motion.div>
        ))}
      </div>
      
      <div className="p-4 border-t dark:border-gray-700">
        <div className="flex items-center space-x-2">
          <input
            type="text"
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 rounded-full border dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-sm"
            disabled
          />
          <button className="p-2 rounded-full bg-whatsapp text-white">
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}