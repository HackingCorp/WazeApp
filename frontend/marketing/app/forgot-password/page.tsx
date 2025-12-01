"use client"

import { useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Mail, ArrowLeft, AlertCircle, CheckCircle } from "lucide-react"
import { api } from "@/lib/api"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    try {
      const response = await api.forgotPassword(email)
      
      if (response.success) {
        setSubmitted(true)
      } else {
        setError(response.error || "Failed to send reset email. Please try again.")
      }
    } catch (err) {
      setError("Network error. Please try again.")
      console.error("Forgot password error:", err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          <Link
            href="/login"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to login
          </Link>

          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-lg bg-whatsapp mb-4">
              <span className="text-white font-bold text-xl">W</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reset your password</h1>
            <p className="text-muted-foreground mt-2">
              {submitted
                ? "Check your email for reset instructions"
                : "Enter your email and we'll send you a reset link"}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center">
                <AlertCircle className="h-4 w-4 text-red-500 mr-2" />
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            </div>
          )}

          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-gray-700 dark:border-gray-600"
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Sending...
                  </>
                ) : (
                  "Send reset link"
                )}
              </Button>
            </form>
          ) : (
            <div className="text-center">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/20 mb-4">
                <Mail className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-gray-700 dark:text-gray-300 mb-6">
                We&apos;ve sent a password reset link to <strong>{email}</strong>
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                Didn&apos;t receive the email? Check your spam folder or{" "}
                <button
                  onClick={() => setSubmitted(false)}
                  className="text-primary hover:underline"
                >
                  try again
                </button>
              </p>
              <Link href="/login">
                <Button variant="outline" className="w-full">
                  Back to login
                </Button>
              </Link>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}