"use client"

import { motion } from "framer-motion"
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
} from "lucide-react"
import { useTranslations } from "@/lib/hooks/use-translations"

export function FeaturesSection() {
  const { t } = useTranslations()
  
  const features = [
    {
      name: t("feature24_7Name"),
      description: t("feature24_7Desc"),
      icon: Clock,
    },
    {
      name: t("featureMultilingualName"),
      description: t("featureMultilingualDesc"),
      icon: Globe2,
    },
    {
      name: t("featureInstantName"),
      description: t("featureInstantDesc"),
      icon: Zap,
    },
    {
      name: t("featureMediaName"),
      description: t("featureMediaDesc"),
      icon: FileText,
    },
    {
      name: t("featureTeamName"),
      description: t("featureTeamDesc"),
      icon: Users,
    },
    {
      name: t("featureAnalyticsName"),
      description: t("featureAnalyticsDesc"),
      icon: BarChart3,
    },
    {
      name: t("featureSecurityName"),
      description: t("featureSecurityDesc"),
      icon: Shield,
    },
    {
      name: t("featureAiName"),
      description: t("featureAiDesc"),
      icon: Sparkles,
    },
  ]

  return (
    <section className="py-20 sm:py-32 bg-gray-50 dark:bg-gray-900/50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {t("featuresTitle")}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t("featuresSubtitle")}
            </p>
          </motion.div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={feature.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all duration-300"
            >
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {feature.name}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}