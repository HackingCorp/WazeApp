"use client"

import { motion } from "framer-motion"
import { formatNumber } from "@/lib/utils"
import { useTranslations } from "@/lib/hooks/use-translations"

export function StatsSection() {
  const { t } = useTranslations()
  
  const stats = [
    {
      label: t("statsActiveUsers"),
      value: 10000,
      suffix: "+",
      description: t("statsActiveUsersDesc"),
    },
    {
      label: t("statsMessagesHandled"),
      value: 50000000,
      suffix: "+",
      description: t("statsMessagesHandledDesc"),
    },
    {
      label: t("statsResponseTime"),
      value: 0.3,
      suffix: "s",
      description: t("statsResponseTimeDesc"),
    },
    {
      label: t("statsSatisfactionRate"),
      value: 98,
      suffix: "%",
      description: t("statsSatisfactionRateDesc"),
    },
  ]

  return (
    <section className="py-20 bg-primary text-white">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="text-center"
            >
              <div className="text-4xl sm:text-5xl font-bold mb-2">
                {stat.value < 100 ? stat.value : formatNumber(stat.value)}
                {stat.suffix}
              </div>
              <div className="text-lg font-medium mb-1">{stat.label}</div>
              <div className="text-sm opacity-90">{stat.description}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}