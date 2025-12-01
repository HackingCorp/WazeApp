"use client"

import { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Mail, CheckCircle, AlertCircle, ArrowLeft } from "lucide-react"
import { api } from "@/lib/api"

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isResendLoading, setIsResendLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [isVerified, setIsVerified] = useState(false)
  const [email, setEmail] = useState("")

  const token = searchParams.get('token')

  useEffect(() => {
    if (token) {
      verifyEmail(token)
    }
  }, [token])

  const verifyEmail = async (verifyToken: string) => {
    setIsLoading(true)
    setError("")

    try {
      const response = await api.verifyEmail(verifyToken)
      
      if (response.success) {
        setIsVerified(true)
        setMessage("Your email has been successfully verified! You can now sign in.")
        
        // Redirect to login after 3 seconds
        setTimeout(() => {
          router.push("/login")
        }, 3000)
      } else {
        setError(response.error || "Email verification failed. The token may be invalid or expired.")
      }
    } catch (err) {
      setError("Network error. Please try again.")
      console.error("Email verification error:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const resendVerification = async () => {
    if (!email) {
      setError("Please enter your email address")
      return
    }

    setIsResendLoading(true)
    setError("")
    setMessage("")

    try {
      const response = await api.resendVerificationEmail(email)
      
      if (response.success) {
        setMessage("Verification email sent! Please check your inbox.")
      } else {
        setError(response.error || "Failed to send verification email. Please try again.")
      }
    } catch (err) {
      setError("Network error. Please try again.")
      console.error("Resend verification error:", err)
    } finally {
      setIsResendLoading(false)
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
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900/20 mb-4">
              {isVerified ? (
                <CheckCircle className="h-8 w-8 text-green-500" />
              ) : (
                <Mail className="h-8 w-8 text-blue-500" />
              )}
            </div>
            
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {isVerified ? "Email Verified!" : "Verify your email"}
            </h1>
            
            {!token && !isVerified && (
              <p className="text-muted-foreground">
                We sent you a verification email. Please check your inbox and click the verification link.
              </p>
            )}
          </div>

          {isLoading && (
            <div className="text-center mb-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-sm text-muted-foreground">Verifying your email...</p>
            </div>
          )}

          {message && (
            <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center">
                <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                <p className="text-sm text-green-700 dark:text-green-300">{message}</p>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center">
                <AlertCircle className="h-4 w-4 text-red-500 mr-2" />
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            </div>
          )}

          {isVerified && (
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                Redirecting to login page in 3 seconds...
              </p>
              <Link href="/login">
                <Button className="w-full">
                  Continue to Login
                </Button>
              </Link>
            </div>
          )}

          {!isVerified && !isLoading && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Didn't receive the email? Check your spam folder or resend it.
              </p>
              
              <div className="space-y-4">
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
                      placeholder="your@example.com"
                    />
                  </div>
                </div>
                
                <Button 
                  onClick={resendVerification} 
                  disabled={isResendLoading}
                  variant="outline" 
                  className="w-full"
                >
                  {isResendLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                      Sending...
                    </>
                  ) : (
                    "Resend verification email"
                  )}
                </Button>
              </div>
            </div>
          )}

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Already verified?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VerifyEmailContent />
    </Suspense>
  )
}