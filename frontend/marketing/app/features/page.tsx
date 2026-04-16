"use client"

import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  MessageSquare,
  Globe2,
  Zap,
  Shield,
  BarChart3,
  Users,
  FileText,
  Sparkles,
  Clock,
  ArrowRight,
  CheckCircle,
} from "lucide-react"
import { useTranslations } from "@/lib/hooks/use-translations"
import featureIllustrations from "@/components/features/feature-illustrations"


export default function FeaturesPage() {
  const { t } = useTranslations()
  
  const features = [
    {
      name: t("detailedFeature24_7"),
      description: t("detailedFeature24_7Desc"),
      icon: Clock,
      benefits: [
        t("benefit247Support"),
        t("benefitNoMissed"),
        t("benefitInstantResponse"),
        t("benefitWeekendCoverage"),
      ],
    },
    {
      name: t("detailedFeatureMultilingual"),
      description: t("detailedFeatureMultilingualDesc"),
      icon: Globe2,
      benefits: [
        t("benefit95Languages"),
        t("benefitRealTimeTranslation"),
        t("benefitCulturalResponses"),
        t("benefitGlobalExpansion"),
      ],
    },
    {
      name: t("detailedFeatureFastResponse"),
      description: t("detailedFeatureFastResponseDesc"),
      icon: Zap,
      benefits: [
        t("benefit03Second"),
        t("benefitInstantAck"),
        t("benefitReducedFrustration"),
        t("benefitHigherConversion"),
      ],
    },
    {
      name: t("detailedFeatureRichMedia"),
      description: t("detailedFeatureRichMediaDesc"),
      icon: FileText,
      benefits: [
        t("benefitImageDoc"),
        t("benefitVoiceTranscription"),
        t("benefitVideoSharing"),
        t("benefitFileStorage"),
      ],
    },
    {
      name: t("detailedFeatureTeamCollab"),
      description: t("detailedFeatureTeamCollabDesc"),
      icon: Users,
      benefits: [
        t("benefitMultiAgent"),
        t("benefitSeamlessHandover"),
        t("benefitTeamPermissions"),
        t("benefitCollabHistory"),
      ],
    },
    {
      name: t("detailedFeatureAnalytics"),
      description: t("detailedFeatureAnalyticsDesc"),
      icon: BarChart3,
      benefits: [
        t("benefitRealtimeMetrics"),
        t("benefitSatisfactionTracking"),
        t("benefitResponseAnalytics"),
        t("benefitBusinessInsights"),
      ],
    },
    {
      name: t("detailedFeatureSecurity"),
      description: t("detailedFeatureSecurityDesc"),
      icon: Shield,
      benefits: [
        t("benefitEndToEndEncryption"),
        t("benefitCompliance"),
        t("benefitSecurityAudits"),
        t("benefitDataResidency"),
      ],
    },
    {
      name: t("detailedFeatureIntelligent"),
      description: t("detailedFeatureIntelligentDesc"),
      icon: Sparkles,
      benefits: [
        t("benefitContextAware"),
        t("benefitBrandVoice"),
        t("benefitLearningInteractions"),
        t("benefitPersonalizedExperience"),
      ],
    },
    {
      name: t("detailedFeatureIntegrations"),
      description: t("detailedFeatureIntegrationsDesc"),
      icon: MessageSquare,
      benefits: [
        t("benefit1000Integrations"),
        t("benefitWebhookSupport"),
        t("benefitCRMSync"),
        t("benefitEcommerceConnections"),
      ],
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-to-b from-green-50 to-white dark:from-green-950/20 dark:to-background py-20 sm:py-32">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <div className="animate-fade-in-up">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6">
                {t("featuresPageTitle")}
                <span className="text-whatsapp"> {t("featuresPageTitleHighlight")}</span>
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
                {t("featuresPageSubtitle")}
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
            {features.map((feature, index) => (
              <div
                key={feature.name}
                className={`animate-fade-in-up grid lg:grid-cols-2 gap-12 items-center ${
                  index % 2 === 1 ? "lg:grid-flow-col-dense" : ""
                }`}
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className={index % 2 === 1 ? "lg:col-start-2" : ""}>
                  <div className="flex items-center mb-6">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mr-4">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                      {feature.name}
                    </h2>
                  </div>
                  <p className="text-lg text-muted-foreground mb-8">
                    {feature.description}
                  </p>
                  <div className="space-y-3">
                    {feature.benefits.map((benefit) => (
                      <div key={benefit} className="flex items-center">
                        <CheckCircle className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                        <span className="text-gray-700 dark:text-gray-300">{benefit}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={index % 2 === 1 ? "lg:col-start-1" : ""}>
                  {featureIllustrations[index] ? (() => {
                    const IllustrationComponent = featureIllustrations[index]
                    return <IllustrationComponent />
                  })() : (
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl p-8 h-80 flex items-center justify-center">
                      <feature.icon className="h-32 w-32 text-primary/20" />
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
              {t("ctaReadyTransform")}
            </h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto">
              {t("ctaJoinBusinesses")}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register">
                <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                  {t("featuresStartTrial")}
                </Button>
              </Link>
              <Link href="/pricing">
                <Button size="lg" variant="outline" className="w-full sm:w-auto border-white text-white bg-transparent hover:bg-white hover:text-primary">
                  {t("ctaViewPricing")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}