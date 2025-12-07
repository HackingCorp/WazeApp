"use client"

import { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
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
  CheckCircle,
  Check,
  X,
  Sparkles
} from "lucide-react"
import { api } from "@/lib/api"
import { PhoneInput } from "@/components/ui/phone-input"

// Plan data
const plans = [
  {
    id: "FREE",
    name: "Gratuit",
    description: "Parfait pour essayer WazeApp",
    price: 0,
    features: [
      { name: "1 Agent WhatsApp", included: true },
      { name: "100 messages/mois", included: true },
      { name: "100MB de stockage", included: true },
      { name: "Support par e-mail", included: true },
    ],
    popular: false,
  },
  {
    id: "STANDARD",
    name: "Standard",
    description: "Idéal pour les petites entreprises",
    price: 2,
    features: [
      { name: "1 Agent WhatsApp", included: true },
      { name: "2 000 messages/mois", included: true },
      { name: "500MB de stockage", included: true },
      { name: "Support prioritaire", included: true },
    ],
    popular: false,
  },
  {
    id: "PRO",
    name: "Pro",
    description: "Pour les équipes en croissance",
    price: 3,
    features: [
      { name: "3 Agents WhatsApp", included: true },
      { name: "8 000 messages/mois", included: true },
      { name: "5GB de stockage", included: true },
      { name: "Support chat 24h/24", included: true },
    ],
    popular: true,
  },
  {
    id: "ENTERPRISE",
    name: "Entreprise",
    description: "Pour les grandes organisations",
    price: 4,
    features: [
      { name: "10 Agents WhatsApp", included: true },
      { name: "30 000 messages/mois", included: true },
      { name: "20GB de stockage", included: true },
      { name: "Support dédié", included: true },
    ],
    popular: false,
  },
]

function RegisterPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
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
    selectedPlan: "FREE",
  })

  // Check for plan parameter in URL
  useEffect(() => {
    const planParam = searchParams?.get('plan')
    if (planParam && plans.find(p => p.id === planParam.toUpperCase())) {
      setFormData(prev => ({ ...prev, selectedPlan: planParam.toUpperCase() }))
    }
  }, [searchParams])

  const steps = [
    { id: 1, title: "Forfait", description: "Choisissez votre forfait" },
    { id: 2, title: "Informations", description: "Parlez-nous de vous" },
    { id: 3, title: "Compte", description: "Créez votre compte" },
    { id: 4, title: "Organisation", description: "Configurez votre espace" },
  ]

  const validateStep = (step: number): boolean => {
    setError("")

    switch (step) {
      case 1:
        // Plan selection - always valid (has default)
        return true

      case 2:
        if (!formData.firstName.trim()) {
          setError("Le prénom est requis")
          return false
        }
        if (!formData.lastName.trim()) {
          setError("Le nom est requis")
          return false
        }
        return true

      case 3:
        if (!formData.email.trim()) {
          setError("L'email est requis")
          return false
        }
        if (!formData.password) {
          setError("Le mot de passe est requis")
          return false
        }
        if (formData.password.length < 8) {
          setError("Le mot de passe doit contenir au moins 8 caractères")
          return false
        }
        const passwordRegex = /((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/;
        if (!passwordRegex.test(formData.password)) {
          setError("Le mot de passe doit contenir majuscule, minuscule et chiffre/caractère spécial")
          return false
        }
        if (formData.password !== formData.confirmPassword) {
          setError("Les mots de passe ne correspondent pas")
          return false
        }
        return true

      case 4:
        if (!formData.acceptTerms) {
          setError("Vous devez accepter les conditions d'utilisation")
          return false
        }
        return true

      default:
        return true
    }
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 4))
    }
  }

  const handlePrev = () => {
    setError("")
    setCurrentStep(prev => Math.max(prev - 1, 1))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateStep(4)) return

    setIsLoading(true)

    try {
      const response = await api.register({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        password: formData.password,
        phone: formData.phone.trim() || undefined,
        organizationName: formData.organizationName.trim() || undefined,
        plan: formData.selectedPlan,
      })

      if (response.success) {
        // If paid plan selected, redirect to billing page after verification
        if (formData.selectedPlan !== "FREE") {
          router.push(`/verify-email?plan=${formData.selectedPlan.toLowerCase()}`)
        } else {
          router.push("/verify-email")
        }
      } else {
        setError(response.error || "Échec de l'inscription. Veuillez réessayer.")
      }
    } catch (err) {
      setError("Erreur réseau. Veuillez réessayer.")
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
            className="space-y-4"
          >
            <p className="text-sm text-center text-muted-foreground mb-4">
              Sélectionnez le forfait qui correspond à vos besoins
            </p>
            <div className="grid grid-cols-2 gap-3">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setFormData({ ...formData, selectedPlan: plan.id })}
                  className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                    formData.selectedPlan === plan.id
                      ? "border-primary bg-primary/5 dark:bg-primary/10"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-2 right-2">
                      <span className="bg-primary text-white text-xs px-2 py-0.5 rounded-full flex items-center">
                        <Sparkles className="h-3 w-3 mr-1" />
                        Populaire
                      </span>
                    </div>
                  )}
                  {formData.selectedPlan === plan.id && (
                    <div className="absolute top-2 left-2">
                      <CheckCircle className="h-5 w-5 text-primary" />
                    </div>
                  )}
                  <div className={formData.selectedPlan === plan.id ? "pl-6" : ""}>
                    <h4 className="font-semibold text-gray-900 dark:text-white">{plan.name}</h4>
                    <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white mt-2">
                      ${plan.price}<span className="text-sm font-normal text-muted-foreground">/mois</span>
                    </p>
                    <ul className="mt-3 space-y-1">
                      {plan.features.slice(0, 2).map((feature, idx) => (
                        <li key={idx} className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                          <Check className="h-3 w-3 text-green-500 mr-1 flex-shrink-0" />
                          {feature.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                </button>
              ))}
            </div>
            <p className="text-xs text-center text-muted-foreground">
              Vous pourrez modifier votre forfait à tout moment
            </p>
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Prénom *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    id="firstName"
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-gray-700 dark:border-gray-600"
                    placeholder="Jean"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Nom *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    id="lastName"
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-gray-700 dark:border-gray-600"
                    placeholder="Dupont"
                    required
                  />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Numéro de téléphone (optionnel)
              </label>
              <PhoneInput
                value={formData.phone}
                onChange={(value) => setFormData({ ...formData, phone: value })}
                placeholder="6 12 34 56 78"
              />
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
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Adresse email *
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-gray-700 dark:border-gray-600"
                  placeholder="vous@exemple.com"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Mot de passe *
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
              <p className="mt-1 text-xs text-gray-500">Min. 8 caractères avec majuscule, minuscule et chiffre/caractère spécial</p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Confirmer le mot de passe *
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

      case 4:
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div>
              <label htmlFor="organizationName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Nom de l'organisation (optionnel)
              </label>
              <div className="relative">
                <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="organizationName"
                  type="text"
                  value={formData.organizationName}
                  onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent dark:bg-gray-700 dark:border-gray-600"
                  placeholder="Nom de votre entreprise"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">Laissez vide pour créer un compte personnel</p>
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
                  J'accepte les{" "}
                  <Link href="/terms" className="text-primary hover:underline" target="_blank">
                    Conditions d'utilisation
                  </Link>{" "}
                  et la{" "}
                  <Link href="/privacy" className="text-primary hover:underline" target="_blank">
                    Politique de confidentialité
                  </Link>
                </span>
              </label>
            </div>

            {/* Summary of selected plan */}
            <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Forfait sélectionné</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {plans.find(p => p.id === formData.selectedPlan)?.name}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-primary">
                    ${plans.find(p => p.id === formData.selectedPlan)?.price}/mois
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                <div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">Prêt à commencer !</p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    Vous recevrez un email de vérification après l'inscription.
                    {formData.selectedPlan !== "FREE" && " Vous pourrez ensuite procéder au paiement."}
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
            Retour à l'accueil
          </Link>

          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-lg bg-whatsapp mb-4">
              <span className="text-white font-bold text-xl">W</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Créer votre compte</h1>
            <p className="text-muted-foreground mt-2">
              {steps[currentStep - 1].description}
            </p>
          </div>

          {/* Progress Steps */}
          <div className="flex justify-between mb-8">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className={`
                  flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium
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
                  <div className={`w-8 h-1 mx-1 ${
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
                  Précédent
                </Button>
              ) : (
                <div /> // Spacer
              )}

              {currentStep < 4 ? (
                <Button
                  type="button"
                  onClick={handleNext}
                  className="flex items-center"
                >
                  Suivant
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button type="submit" disabled={isLoading} className="flex items-center">
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Création en cours...
                    </>
                  ) : (
                    <>
                      Créer mon compte
                      <CheckCircle className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </form>

          {currentStep === 2 && (
            <>
              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t dark:border-gray-700"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white dark:bg-gray-800 text-gray-500">Ou continuer avec</span>
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
              Vous avez déjà un compte ?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Se connecter
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    }>
      <RegisterPageContent />
    </Suspense>
  )
}