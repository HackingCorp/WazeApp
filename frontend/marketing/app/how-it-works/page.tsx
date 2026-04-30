"use client"

import Link from "next/link"

import { Button } from "@/components/ui/button"
import { MessageSquare, Settings, Zap, ArrowRight, CheckCircle } from "lucide-react"
import { useTranslations } from "@/lib/hooks/use-translations"
import howItWorksIllustrations from "@/components/features/how-it-works-illustrations"

export default function HowItWorksPage() {
  const { t } = useTranslations()

  const steps = [
    {
      number: t("step1Number"),
      title: t("step1Title"),
      description: t("step1Description"),
      icon: MessageSquare,
      details: [
        t("step1Detail1"),
        t("step1Detail2"),
        t("step1Detail3"),
        t("step1Detail4"),
      ],
    },
    {
      number: t("step2Number"),
      title: t("step2Title"),
      description: t("step2Description"),
      icon: Settings,
      details: [
        t("step2Detail1"),
        t("step2Detail2"),
        t("step2Detail3"),
        t("step2Detail4"),
      ],
    },
    {
      number: t("step3Number"),
      title: t("step3Title"),
      description: t("step3Description"),
      icon: Zap,
      details: [
        t("step3Detail1"),
        t("step3Detail2"),
        t("step3Detail3"),
        t("step3Detail4"),
      ],
    },
  ]

  const benefits = [
    {
      title: t("whyChoose1Title"),
      description: t("whyChoose1Desc"),
    },
    {
      title: t("whyChoose2Title"),
      description: t("whyChoose2Desc"),
    },
    {
      title: t("whyChoose3Title"),
      description: t("whyChoose3Desc"),
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-to-b from-green-50 to-white dark:from-green-950/20 dark:to-background py-20 sm:py-32">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <div className="animate-fade-in-up">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6">
                {t("howItWorksTitle")}
                <span className="text-primary"> {t("howItWorksTitleHighlight")}</span>
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
                {t("howItWorksSubtitle")}
              </p>
              <Link href="/register">
                <Button size="lg">
                  {t("featuresStartTrial")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="py-20 sm:py-32">
        <div className="container mx-auto px-4">
          <div className="space-y-24">
            {steps.map((step, index) => (
              <div
                key={step.number}
                className={`animate-fade-in-up grid lg:grid-cols-2 gap-12 items-center ${
                  index % 2 === 1 ? "lg:grid-flow-col-dense" : ""
                }`}
                style={{ animationDelay: `${index * 0.2}s` }}
              >
                <div className={index % 2 === 1 ? "lg:col-start-2" : ""}>
                  <div className="flex items-center mb-6">
                    <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mr-6">
                      <span className="text-2xl font-bold text-primary">{step.number}</span>
                    </div>
                    <div>
                      <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                        {step.title}
                      </h2>
                    </div>
                  </div>
                  <p className="text-lg text-muted-foreground mb-8">
                    {step.description}
                  </p>
                  <div className="space-y-3">
                    {step.details.map((detail, detailIndex) => (
                      <div key={detailIndex} className="flex items-center">
                        <CheckCircle className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                        <span className="text-gray-700 dark:text-gray-300">{detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={index % 2 === 1 ? "lg:col-start-1" : ""}>
                  {howItWorksIllustrations[index] ? (() => {
                    const IllustrationComponent = howItWorksIllustrations[index]
                    return <IllustrationComponent />
                  })() : (
                    <div className="bg-gradient-to-br from-primary/5 to-primary/20 rounded-2xl p-8 h-80 flex items-center justify-center">
                      <step.icon className="h-32 w-32 text-primary" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-gray-900/50 py-20">
        <div className="container mx-auto px-4">
          <div className="animate-fade-in-up text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-6">
              {t("whyChooseTitle")}
            </h2>
            <div className="grid md:grid-cols-3 gap-8 mt-12">
              {benefits.map((benefit, index) => (
                <div key={index} className="bg-white dark:bg-gray-800 rounded-xl p-6">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                    {benefit.title}
                  </h3>
                  <p className="text-muted-foreground">{benefit.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-primary text-white py-20">
        <div className="container mx-auto px-4 text-center">
          <div className="animate-fade-in-up">
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">
              {t("ctaReadyGetStarted")}
            </h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto">
              {t("ctaJoinThousands")}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register">
                <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                  {t("featuresStartTrial")}
                </Button>
              </Link>
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto border-white text-white bg-transparent hover:bg-white hover:text-primary"
                onClick={() => (window as any).__openDemoChat?.()}
              >
                {t("tryDemo")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}