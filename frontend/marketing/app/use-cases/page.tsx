"use client"

import Link from "next/link"

import { Button } from "@/components/ui/button"
import { ShoppingCart, Home, Utensils, ArrowRight } from "lucide-react"
import useCasesIllustrations from "@/components/features/use-cases-illustrations"
import { useTranslations } from "@/lib/hooks/use-translations"

export default function UseCasesPage() {
  const { t } = useTranslations()

  const useCases = [
    {
      title: t("useCaseEcommerceTitle"),
      description: t("useCaseEcommerceDesc"),
      icon: ShoppingCart,
      benefits: [
        t("useCaseEcommerceBenefit1"),
        t("useCaseEcommerceBenefit2"),
        t("useCaseEcommerceBenefit3"),
        t("useCaseEcommerceBenefit4"),
      ],
      stats: {
        improvement: t("useCaseEcommerceStat1"),
        time: t("useCaseEcommerceStat2"),
      },
    },
    {
      title: t("useCaseRealEstateTitle"),
      description: t("useCaseRealEstateDesc"),
      icon: Home,
      benefits: [
        t("useCaseRealEstateBenefit1"),
        t("useCaseRealEstateBenefit2"),
        t("useCaseRealEstateBenefit3"),
        t("useCaseRealEstateBenefit4"),
      ],
      stats: {
        improvement: t("useCaseRealEstateStat1"),
        time: t("useCaseRealEstateStat2"),
      },
    },
    {
      title: t("useCaseRestaurantsTitle"),
      description: t("useCaseRestaurantsDesc"),
      icon: Utensils,
      benefits: [
        t("useCaseRestaurantsBenefit1"),
        t("useCaseRestaurantsBenefit2"),
        t("useCaseRestaurantsBenefit3"),
        t("useCaseRestaurantsBenefit4"),
      ],
      stats: {
        improvement: t("useCaseRestaurantsStat1"),
        time: t("useCaseRestaurantsStat2"),
      },
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-to-b from-green-50 to-white dark:from-green-950/20 dark:to-background py-20 sm:py-32">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <div className="animate-fade-in-up">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6">
                {t("useCasesHeroTitle1")}
                <span className="text-primary"> {t("useCasesHeroTitle2")}</span>
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
                {t("useCasesHeroSubtitle")}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="py-20 sm:py-32">
        <div className="container mx-auto px-4">
          <div className="space-y-32">
            {useCases.map((useCase, index) => (
              <div
                key={index}
                className={`animate-fade-in-up grid lg:grid-cols-2 gap-12 items-center ${
                  index % 2 === 1 ? "lg:grid-flow-col-dense" : ""
                }`}
                style={{ animationDelay: `${index * 0.1}s` }}
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
                    {useCase.benefits.map((benefit, i) => (
                      <div key={i} className="flex items-center">
                        <div className="h-2 w-2 rounded-full bg-primary mr-3"></div>
                        <span className="text-gray-700 dark:text-gray-300">{benefit}</span>
                      </div>
                    ))}
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 mb-8">
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">{t("useCasesResultsLabel")}</p>
                        <p className="text-lg font-semibold text-green-600">{useCase.stats.improvement}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t("useCasesEfficiencyLabel")}</p>
                        <p className="text-lg font-semibold text-primary">{useCase.stats.time}</p>
                      </div>
                    </div>
                  </div>

                  <Link href="/register">
                    <Button size="lg">
                      {t("useCasesGetStarted")}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>

                <div className={index % 2 === 1 ? "lg:col-start-1" : ""}>
                  {useCasesIllustrations[index] ? (() => {
                    const IllustrationComponent = useCasesIllustrations[index]
                    return <IllustrationComponent />
                  })() : (
                    <div className="bg-gradient-to-br from-primary/5 to-primary/20 rounded-2xl p-8 h-80 flex items-center justify-center">
                      <useCase.icon className="h-32 w-32 text-primary/40" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-primary text-white py-20">
        <div className="container mx-auto px-4 text-center">
          <div className="animate-fade-in-up">
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">
              {t("useCasesCtaTitle")}
            </h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto">
              {t("useCasesCtaSubtitle")}
            </p>
            <Link href="/register">
              <Button size="lg" variant="secondary">
                {t("useCasesCtaButton")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
