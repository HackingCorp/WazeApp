"use client"

import { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Mail, CheckCircle, AlertCircle, ArrowLeft, ExternalLink } from "lucide-react"
import { api } from "@/lib/api"
import { useTranslations } from "@/lib/hooks/use-translations"

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const { t } = useTranslations()
  const [isLoading, setIsLoading] = useState(false)
  const [isResendLoading, setIsResendLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [isVerified, setIsVerified] = useState(false)
  const [email, setEmail] = useState("")

  const token = searchParams.get('token')
  const emailParam = searchParams.get('email')
  const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || 'https://app.wazeapp.ai'

  // Pre-fill email from query param
  useEffect(() => {
    if (emailParam) {
      setEmail(decodeURIComponent(emailParam))
    }
  }, [emailParam])

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
        setMessage(t('verifyEmailSuccess'))

        // Redirect to dashboard after 3 seconds
        setTimeout(() => {
          window.location.href = dashboardUrl
        }, 3000)
      } else {
        setError(response.error || t('verifyEmailFailed'))
      }
    } catch (err) {
      setError(t('verifyEmailNetworkError'))
      console.error("Email verification error:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const resendVerification = async () => {
    if (!email) {
      setError(t('verifyEmailEnterEmail'))
      return
    }

    setIsResendLoading(true)
    setError("")
    setMessage("")

    try {
      const response = await api.resendVerificationEmail(email)

      if (response.success) {
        setMessage(t('verifyEmailResendSuccess'))
      } else {
        setError(response.error || t('verifyEmailResendFailed'))
      }
    } catch (err) {
      setError(t('verifyEmailNetworkError'))
      console.error("Resend verification error:", err)
    } finally {
      setIsResendLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="animate-fade-in-up w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          <Link
            href="/login"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('verifyEmailBackToLogin')}
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
              {isVerified ? t('verifyEmailVerified') : t('verifyEmailTitle')}
            </h1>

            {!token && !isVerified && (
              <p className="text-muted-foreground">
                {t('verifyEmailDescription')}
              </p>
            )}
          </div>

          {isLoading && (
            <div className="text-center mb-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-sm text-muted-foreground">{t('verifyEmailVerifying')}</p>
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
                {t('verifyEmailRedirecting')}
              </p>
              <a href={dashboardUrl}>
                <Button className="w-full">
                  {t('verifyEmailContinueLogin')}
                </Button>
              </a>
            </div>
          )}

          {!isVerified && !isLoading && (
            <div className="space-y-4">
              {/* Go to Dashboard button — skip verification */}
              <a href={dashboardUrl}>
                <Button className="w-full" size="lg">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  {t('verifyEmailGoToDashboard')}
                </Button>
              </a>

              <p className="text-xs text-muted-foreground text-center">
                {t('verifyEmailSkipNote')}
              </p>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white dark:bg-gray-800 px-2 text-muted-foreground">ou</span>
                </div>
              </div>

              <p className="text-sm text-muted-foreground text-center">
                {t('verifyEmailDidntReceive')}
              </p>

              <div className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('verifyEmailAddressLabel')}
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-gray-700 dark:border-gray-600"
                      placeholder={t('loginEmailPlaceholder')}
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
                      {t('verifyEmailResendSending')}
                    </>
                  ) : (
                    t('verifyEmailResendButton')
                  )}
                </Button>
              </div>
            </div>
          )}

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('verifyEmailAlreadyVerified')}{" "}
              <Link href="/login" className="text-primary hover:underline">
                {t('verifyEmailSignIn')}
              </Link>
            </p>
          </div>
        </div>
      </div>
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
