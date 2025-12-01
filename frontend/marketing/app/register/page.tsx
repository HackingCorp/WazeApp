"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowLeft, 
  ArrowRight,
  User, 
  AlertCircle, 
  Building,
  CheckCircle
} from "lucide-react"
import { api } from "@/lib/api"
import { PhoneInput } from "@/components/ui/phone-input"

export default function RegisterPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
    organizationName: "",
    acceptTerms: false,
  })

  const steps = [
    { id: 1, title: "Personal Info", description: "Tell us about yourself" },
    { id: 2, title: "Account Setup", description: "Create your account" },
    { id: 3, title: "Organization", description: "Set up your workspace" },
  ]

  const validateStep = (step: number): boolean => {
    setError("")
    
    switch (step) {
      case 1:
        if (!formData.firstName.trim()) {
          setError("First name is required")
          return false
        }
        if (!formData.lastName.trim()) {
          setError("Last name is required")
          return false
        }
        return true
      
      case 2:
        if (!formData.email.trim()) {
          setError("Email is required")
          return false
        }
        if (!formData.password) {
          setError("Password is required")
          return false
        }
        if (formData.password.length < 8) {
          setError("Password must be at least 8 characters long")
          return false
        }
        const passwordRegex = /((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/;
        if (!passwordRegex.test(formData.password)) {
          setError("Password must contain uppercase, lowercase, and number/special character")
          return false
        }
        if (formData.password !== formData.confirmPassword) {
          setError("Passwords do not match")
          return false
        }
        return true
      
      case 3:
        if (!formData.acceptTerms) {
          setError("You must accept the terms and conditions")
          return false
        }
        return true
      
      default:
        return true
    }
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 3))
    }
  }

  const handlePrev = () => {
    setError("")
    setCurrentStep(prev => Math.max(prev - 1, 1))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateStep(3)) return

    setIsLoading(true)

    try {
      const response = await api.register({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        password: formData.password,
        phone: formData.phone.trim() || undefined,
        organizationName: formData.organizationName.trim() || undefined,
      })

      if (response.success) {
        router.push("/verify-email")
      } else {
        setError(response.error || "Registration failed. Please try again.")
      }
    } catch (err) {
      setError("Network error. Please try again.")
      console.error("Registration error:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSocialSignup = (provider: string) => {
    setIsLoading(true)
    
    switch (provider) {
      case 'google':
        window.location.href = api.getGoogleAuthUrl()
        break
      case 'microsoft':
        window.location.href = api.getMicrosoftAuthUrl()
        break
      case 'facebook':
        window.location.href = api.getFacebookAuthUrl()
        break
      default:
        setError(`${provider} signup not supported`)
        setIsLoading(false)
    }
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  First name *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    id="firstName"
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-gray-700 dark:border-gray-600"
                    placeholder="John"
                    required
                  />
                </div>
              </div>
              
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Last name *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    id="lastName"
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-gray-700 dark:border-gray-600"
                    placeholder="Doe"
                    required
                  />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Phone number (optional)
              </label>
              <PhoneInput
                value={formData.phone}
                onChange={(value) => setFormData({ ...formData, phone: value })}
                placeholder="6 12 34 56 78"
              />
            </div>
          </motion.div>
        )

      case 2:
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email address *
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-gray-700 dark:border-gray-600"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Password *
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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
              <p className="mt-1 text-xs text-gray-500">Must be at least 8 characters with uppercase, lowercase, and number/special character</p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Confirm password *
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-gray-700 dark:border-gray-600"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>
          </motion.div>
        )

      case 3:
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div>
              <label htmlFor="organizationName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Organization name (optional)
              </label>
              <div className="relative">
                <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="organizationName"
                  type="text"
                  value={formData.organizationName}
                  onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-gray-700 dark:border-gray-600"
                  placeholder="Your company name"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">Leave empty to create a personal account</p>
            </div>

            <div>
              <label className="flex items-start">
                <input
                  type="checkbox"
                  checked={formData.acceptTerms}
                  onChange={(e) => setFormData({ ...formData, acceptTerms: e.target.checked })}
                  className="mt-1 rounded border-gray-300 text-primary focus:ring-primary"
                  required
                />
                <span className="ml-3 text-sm text-gray-600 dark:text-gray-400">
                  I agree to the{" "}
                  <Link href="/terms" className="text-primary hover:underline" target="_blank">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" className="text-primary hover:underline" target="_blank">
                    Privacy Policy
                  </Link>
                </span>
              </label>
            </div>

            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                <div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">Ready to get started!</p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    You'll receive an email verification link after registration.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )

      default:
        return null
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
            href="/"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to home
          </Link>

          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-lg bg-whatsapp mb-4">
              <span className="text-white font-bold text-xl">W</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create your account</h1>
            <p className="text-muted-foreground mt-2">
              {steps[currentStep - 1].description}
            </p>
          </div>

          {/* Progress Steps */}
          <div className="flex justify-between mb-8">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className={`
                  flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium
                  ${currentStep > step.id 
                    ? 'bg-green-500 text-white' 
                    : currentStep === step.id 
                    ? 'bg-primary text-white' 
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
                  }
                `}>
                  {currentStep > step.id ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    step.id
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div className={`w-12 h-1 mx-2 ${
                    currentStep > step.id ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-600'
                  }`} />
                )}
              </div>
            ))}
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center">
                <AlertCircle className="h-4 w-4 text-red-500 mr-2" />
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <AnimatePresence mode="wait">
              {renderStepContent()}
            </AnimatePresence>

            <div className="flex justify-between mt-8">
              {currentStep > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePrev}
                  className="flex items-center"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Previous
                </Button>
              ) : (
                <div /> // Spacer
              )}

              {currentStep < 3 ? (
                <Button
                  type="button"
                  onClick={handleNext}
                  className="flex items-center"
                >
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button type="submit" disabled={isLoading} className="flex items-center">
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Creating account...
                    </>
                  ) : (
                    <>
                      Create account
                      <CheckCircle className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </form>

          {currentStep === 1 && (
            <>
              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t dark:border-gray-700"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white dark:bg-gray-800 text-gray-500">Or continue with</span>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleSocialSignup("google")}
                    disabled={isLoading}
                    className="flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    <span className="ml-2 text-sm font-medium">Google</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSocialSignup("microsoft")}
                    disabled={isLoading}
                    className="flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 21 21">
                      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                    </svg>
                    <span className="ml-2 text-sm font-medium">Microsoft</span>
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Already have an account?{" "}
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