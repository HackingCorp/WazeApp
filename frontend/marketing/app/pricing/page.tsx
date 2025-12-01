"use client"

import { useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Check, X, Sparkles } from "lucide-react"
import { useTranslations } from "@/lib/hooks/use-translations"
// import { formatCurrency } from "@/lib/utils"


const currencies = [
  { code: "USD", symbol: "$", rate: 1 },
  { code: "EUR", symbol: "€", rate: 0.92 },
  { code: "GBP", symbol: "£", rate: 0.79 },
  { code: "XAF", symbol: "FCFA ", rate: 655 },
]


export default function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annually">("monthly")
  const [currency, setCurrency] = useState(currencies[0])
  const { t } = useTranslations()

  const calculatePrice = (price: number) => {
    if (currency.code === 'XAF') {
      // Prix spécifiques pour Mobile Money en FCFA
      const fcfaPrices = { 29: 6550, 69: 19650, 199: 65500, 278: 52400, 662: 157080, 1910: 523800 };
      return fcfaPrices[price] || Math.round(price * currency.rate);
    }
    return Math.round(price * currency.rate)
  }

  const plans = [
    {
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
      name: t("planStandard"),
      description: t("planStandardDesc"),
      price: { monthly: 29, annually: 278 },
      features: [
        { name: t("feature1Agent"), included: true },
        { name: t("feature2kMessages"), included: true },
        { name: t("feature500MBStorage"), included: true },
        { name: t("featureAdvancedAnalytics"), included: true },
        { name: t("featurePriorityEmailSupport"), included: true },
        { name: t("featureAPIAccess"), included: true },
        { name: t("featureCustomIntegrations"), included: false },
        { name: t("featurePrioritySupport"), included: false },
        { name: t("featureWhiteLabel"), included: false },
      ],
      cta: t("ctaStartTrial"),
      popular: false,
    },
    {
      name: t("planPro"),
      description: t("planProDesc"),
      price: { monthly: 69, annually: 662 },
      features: [
        { name: t("feature3Agents"), included: true },
        { name: t("feature8kMessages"), included: true },
        { name: t("feature5GBStorage"), included: true },
        { name: t("featureAdvancedAnalytics"), included: true },
        { name: t("feature24x7ChatSupport"), included: true },
        { name: t("featureAPIAccess"), included: true },
        { name: t("featureCustomIntegrations"), included: true },
        { name: t("featurePrioritySupport"), included: true },
        { name: t("featureWhiteLabel"), included: false },
      ],
      cta: t("ctaStartTrial"),
      popular: true,
    },
    {
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
            onChange={(e) => setCurrency(currencies.find((c) => c.code === e.target.value)!)}
            className="px-4 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800"
          >
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
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
                    {currency.symbol}
                    {calculatePrice(plan.price[billingPeriod])}
                  </span>
                  <span className="text-muted-foreground">
                    /{billingPeriod === "monthly" ? t("perMonth") : t("perYear")}
                  </span>
                </div>

                <Link href="/register">
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