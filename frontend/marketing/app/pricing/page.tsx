"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Check, X, Sparkles, Loader2 } from "lucide-react"
import { useTranslations } from "@/lib/hooks/use-translations"

// API URL - uses environment variable or defaults to production
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.wazeapp.xyz/api/v1'

interface CurrencyInfo {
  code: string
  symbol: string
  name: string
}

interface PriceCache {
  [key: string]: {
    price: number;
    yearlyTotal?: number;
  }
}

interface ExchangeRateData {
  rate: number
  rateWithMargin: number
  symbol: string
}

interface ExchangeRates {
  [key: string]: ExchangeRateData
}

// Fallback exchange rates (used only if API fails completely)
const FALLBACK_RATES: { [key: string]: number } = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  XAF: 605,
  XOF: 605,
  NGN: 1550,
  KES: 153,
  GHS: 15.5,
  EGP: 49,
}

export default function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annually">("monthly")
  const [currencies, setCurrencies] = useState<CurrencyInfo[]>([
    { code: "USD", symbol: "$", name: "US Dollar" },
    { code: "EUR", symbol: "€", name: "Euro" },
    { code: "GBP", symbol: "£", name: "British Pound" },
    { code: "XAF", symbol: "FCFA", name: "CFA Franc" },
  ])
  const [currency, setCurrency] = useState<CurrencyInfo>(currencies[0])
  const [priceCache, setPriceCache] = useState<PriceCache>({})
  const [loading, setLoading] = useState(false)
  const [officialRates, setOfficialRates] = useState<ExchangeRates>({})
  const [ratesLastUpdated, setRatesLastUpdated] = useState<Date | null>(null)
  const { t } = useTranslations()

  // Fetch supported currencies and exchange rates on mount
  useEffect(() => {
    fetchCurrencies()
    fetchExchangeRates()
  }, [])

  // Fetch prices when currency or billing period changes
  useEffect(() => {
    fetchPrices()
  }, [currency.code, billingPeriod])

  const fetchCurrencies = async () => {
    try {
      const response = await fetch(`${API_URL}/pricing/currencies`)
      const data = await response.json()
      if (data.success && data.currencies) {
        setCurrencies(data.currencies)
      }
    } catch (error) {
      console.error('Failed to fetch currencies:', error)
    }
  }

  const fetchExchangeRates = async () => {
    try {
      const response = await fetch(`${API_URL}/pricing/rates`)
      const data = await response.json()
      if (data.success && data.rates) {
        setOfficialRates(data.rates)
        if (data.lastUpdated) {
          setRatesLastUpdated(new Date(data.lastUpdated))
        }
        console.log('Official exchange rates loaded:', Object.keys(data.rates).length, 'currencies')
      }
    } catch (error) {
      console.error('Failed to fetch exchange rates:', error)
    }
  }

  const fetchPrices = async () => {
    setLoading(true)
    try {
      const response = await fetch(
        `${API_URL}/pricing?currency=${currency.code}&billing=${billingPeriod}`
      )
      const data = await response.json()
      const plans = data.data?.plans || data.plans
      if (data.success && plans) {
        const newCache: PriceCache = {}
        Object.entries(plans).forEach(([planId, planData]: [string, any]) => {
          newCache[planId] = {
            price: planData.price,
            yearlyTotal: planData.yearlyTotal,
          }
        })
        setPriceCache(newCache)
      }
    } catch (error) {
      console.error('Failed to fetch prices:', error)
      // Fallback to local calculation
    } finally {
      setLoading(false)
    }
  }

  // Base prices in USD
  const basePrices = {
    FREE: { monthly: 0, annually: 0 },
    STANDARD: { monthly: 29.99, annually: 287.90 },
    PRO: { monthly: 49.99, annually: 479.90 },
    ENTERPRISE: { monthly: 199, annually: 1910 },
  }

  const calculatePrice = (price: number, planId?: string) => {
    // Primary: If we have cached API price, use it (already converted by backend)
    if (planId && priceCache[planId]?.price !== undefined) {
      return priceCache[planId].price
    }

    // Fallback: Use official exchange rates from backend for local calculation
    let rateWithMargin: number
    const officialRate = officialRates[currency.code]

    if (officialRate) {
      // Use official rate with margin (already calculated by backend)
      rateWithMargin = officialRate.rateWithMargin
    } else {
      // Ultimate fallback: hardcoded rates with 10% margin
      const fallbackRate = FALLBACK_RATES[currency.code] || 1
      rateWithMargin = fallbackRate * 1.1
    }

    const converted = price * rateWithMargin

    // Round for African currencies
    if (['XAF', 'XOF', 'NGN', 'KES', 'GHS', 'EGP'].includes(currency.code)) {
      return Math.ceil(converted / 100) * 100
    }

    return Math.round(converted * 100) / 100
  }

  // Get yearly total for a plan (for annual billing display)
  const getYearlyTotal = (planId?: string): number | undefined => {
    if (planId && priceCache[planId]?.yearlyTotal) {
      return priceCache[planId].yearlyTotal
    }
    return undefined
  }

  const plans = [
    {
      id: "FREE",
      name: t("planFree"),
      description: t("planFreeDesc"),
      price: { monthly: 0, annually: 0 },
      features: [
        { name: t("feature1Agent"), included: true },
        { name: t("feature100Messages"), included: true },
        { name: t("feature100MBStorage"), included: true },
        { name: t("featureBasicAnalytics"), included: true },
        { name: t("featureEmailSupport"), included: true },
        { name: t("featureAPIAccess"), included: false },
        { name: t("featureCustomIntegrations"), included: false },
        { name: t("featurePrioritySupport"), included: false },
        { name: t("featureWhiteLabel"), included: false },
      ],
      cta: t("ctaStartFree"),
      popular: false,
    },
    {
      id: "STANDARD",
      name: t("planStandard"),
      description: t("planStandardDesc"),
      price: { monthly: 29.99, annually: 287.90 },
      features: [
        { name: t("feature1Agent"), included: true },
        { name: t("feature2kMessages"), included: true },
        { name: t("feature500MBStorage"), included: true },
        { name: t("featureAdvancedAnalytics"), included: true },
        { name: t("featurePriorityEmailSupport"), included: true },
        { name: t("featureScheduling"), included: true },
        { name: t("featureAPIAccess"), included: false },
        { name: t("featureCustomIntegrations"), included: false },
        { name: t("featureWhiteLabel"), included: false },
      ],
      cta: t("ctaStartTrial"),
      popular: false,
    },
    {
      id: "PRO",
      name: t("planPro"),
      description: t("planProDesc"),
      price: { monthly: 49.99, annually: 479.90 },
      features: [
        { name: t("feature3Agents"), included: true },
        { name: t("feature8kMessages"), included: true },
        { name: t("feature5GBStorage"), included: true },
        { name: t("featureAdvancedAnalytics"), included: true },
        { name: t("feature24x7ChatSupport"), included: true },
        { name: t("featureScheduling"), included: true },
        { name: t("featureWebhooks"), included: true },
        { name: t("featureAPIAccess"), included: false },
        { name: t("featureWhiteLabel"), included: false },
      ],
      cta: t("ctaStartTrial"),
      popular: true,
    },
    {
      id: "ENTERPRISE",
      name: t("planEnterprise"),
      description: t("planEnterpriseDesc"),
      price: { monthly: 199, annually: 1910 },
      features: [
        { name: t("feature10Agents"), included: true },
        { name: t("feature30kMessages"), included: true },
        { name: t("feature20GBStorage"), included: true },
        { name: t("featureCustomAnalytics"), included: true },
        { name: t("featureDedicatedSupport"), included: true },
        { name: t("featureAPIAccess"), included: true },
        { name: t("featureCustomIntegrations"), included: true },
        { name: t("featurePrioritySupport"), included: true },
        { name: t("featureWhiteLabel"), included: true },
      ],
      cta: t("ctaContactSales"),
      popular: false,
    },
  ]

  const faqs = [
    {
      question: t("faqQuestion1"),
      answer: t("faqAnswer1"),
    },
    {
      question: t("faqQuestion2"),
      answer: t("faqAnswer2"),
    },
    {
      question: t("faqQuestion3"),
      answer: t("faqAnswer3"),
    },
    {
      question: t("faqQuestion4"),
      answer: t("faqAnswer4"),
    },
    {
      question: t("faqQuestion5"),
      answer: t("faqAnswer5"),
    },
    {
      question: t("faqQuestion6"),
      answer: t("faqAnswer6"),
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-background">
      <div className="container mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              {t("pricingTitle")}
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t("pricingSubtitle")}
            </p>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-12"
        >
          <div className="flex items-center space-x-3 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setBillingPeriod("monthly")}
              className={`px-4 py-2 rounded-md transition-colors ${
                billingPeriod === "monthly"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400"
              }`}
            >
              {t("billingMonthly")}
            </button>
            <button
              onClick={() => setBillingPeriod("annually")}
              className={`px-4 py-2 rounded-md transition-colors ${
                billingPeriod === "annually"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400"
              }`}
            >
              {t("billingAnnually")}
              <span className="ml-2 text-xs text-green-600 dark:text-green-400">{t("billingSave")}</span>
            </button>
          </div>

          <select
            value={currency.code}
            onChange={(e) => {
              const selected = currencies.find((c) => c.code === e.target.value)
              if (selected) setCurrency(selected)
            }}
            className="px-4 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800"
          >
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} ({c.symbol})
              </option>
            ))}
          </select>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-20">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-lg ${
                plan.popular ? "ring-2 ring-primary" : ""
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <div className="bg-primary text-white px-4 py-1 rounded-full text-sm font-medium flex items-center">
                    <Sparkles className="h-4 w-4 mr-1" />
                    {t("mostPopular")}
                  </div>
                </div>
              )}

              <div className="p-8">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  {plan.name}
                </h3>
                <p className="text-muted-foreground mb-6">{plan.description}</p>

                <div className="mb-6">
                  <span className="text-4xl font-bold text-gray-900 dark:text-white">
                    {loading ? (
                      <Loader2 className="h-8 w-8 animate-spin inline" />
                    ) : (
                      <>
                        {currency.symbol}
                        {calculatePrice(plan.price[billingPeriod], plan.id).toLocaleString()}
                      </>
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    /{t("perMonth")}
                  </span>
                  {billingPeriod === "annually" && plan.price[billingPeriod] > 0 && !loading && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("billingSave")} • {currency.symbol}
                      {(getYearlyTotal(plan.id) || calculatePrice(plan.price[billingPeriod], plan.id) * 12).toLocaleString()} {t("perYear")}
                    </p>
                  )}
                </div>

                <Link href={`/register?plan=${plan.id.toLowerCase()}`}>
                  <Button className="w-full" variant={plan.popular ? "default" : "outline"}>
                    {plan.cta}
                  </Button>
                </Link>

                <div className="mt-8 space-y-4">
                  {plan.features.map((feature) => (
                    <div key={feature.name} className="flex items-start">
                      {feature.included ? (
                        <Check className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                      ) : (
                        <X className="h-5 w-5 text-gray-300 dark:text-gray-600 mr-3 flex-shrink-0" />
                      )}
                      <span
                        className={
                          feature.included
                            ? "text-gray-700 dark:text-gray-300"
                            : "text-gray-400 dark:text-gray-600"
                        }
                      >
                        {feature.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-12">
            {t("faqTitle")}
          </h2>
          <div className="space-y-6">
            {faqs.map((faq, index) => (
              <motion.div
                key={faq.question}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-white dark:bg-gray-800 rounded-lg p-6"
              >
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {faq.question}
                </h3>
                <p className="text-muted-foreground">{faq.answer}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}