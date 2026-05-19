"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Mail, Lock, Eye, EyeOff, ArrowLeft, AlertCircle } from "lucide-react"
import { api } from "@/lib/api"
import { useTranslations } from "@/lib/hooks/use-translations"

export default function LoginPage() {
  const { t } = useTranslations()
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    try {
      const emailClean = (email || '').trim().toLowerCase()
      const passwordClean = (password || '').trim()
      const response = await api.login({ email: emailClean, password: passwordClean })

      if (response.success && response.data) {
        // Authentication successful
        const { user, accessToken, refreshToken } = response.data

        // Store tokens locally
        localStorage.setItem('accessToken', accessToken)
        localStorage.setItem('refreshToken', refreshToken)
        localStorage.setItem('user', JSON.stringify(user))

        // Generate a temporary redirect code for cross-domain auth
        const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || 'https://app.wazeapp.ai'
        const codeResponse = await api.createRedirectCode(accessToken)
        if (codeResponse.success && codeResponse.data?.code) {
          window.location.href = `${dashboardUrl}?code=${encodeURIComponent(codeResponse.data.code)}`
        } else {
          // Fallback: redirect to dashboard login page
          window.location.href = `${dashboardUrl}/login`
        }
        return
      } else {
        const msg = response.error || t('loginInvalidCredentials')
        setError(/401|Unauthorized/i.test(msg) ? t('loginInvalidCredentials') : msg)
      }
    } catch (err) {
      console.error("Authentication failed:", err)
      setError(t('loginNetworkError'))
    }

    setIsLoading(false)
  }


  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in-up">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          <Link
            href="/"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('loginBackToHome')}
          </Link>

          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-lg bg-whatsapp mb-4">
              <span className="text-white font-bold text-xl">W</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('loginWelcomeBack')}</h1>
            <p className="text-muted-foreground mt-2">{t('loginSubtitle')}</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center">
                <AlertCircle className="h-4 w-4 text-red-500 mr-2" />
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('loginEmailLabel')}
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
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('loginPasswordLabel')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-gray-700 dark:border-gray-600"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center">
                <input type="checkbox" className="rounded border-gray-300 text-primary focus:ring-primary" />
                <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">{t('loginRememberMe')}</span>
              </label>
              <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                {t('loginForgotPassword')}
              </Link>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {t('loginSigningIn')}
                </>
              ) : (
                t('loginSignIn')
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('loginNoAccount')}{" "}
              <Link href="/register" className="text-primary hover:underline">
                {t('loginSignUpFree')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
