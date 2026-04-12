'use client';

import { motion } from "framer-motion"
import { Star } from "lucide-react"
import { useTranslations } from "@/lib/hooks/use-translations"

const avatarColors = [
  "bg-blue-600",
  "bg-emerald-600",
  "bg-purple-600",
  "bg-orange-600",
  "bg-rose-600",
  "bg-teal-600",
]

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase()
}

export function TestimonialsSection() {
  const { t } = useTranslations()

  const testimonials = [
    {
      name: "Aminata Diallo",
      role: t("testimonialRole1"),
      company: "DigiServ Afrique",
      content: t("testimonialSarah"),
      rating: 5,
    },
    {
      name: "Jean-Pierre Mbarga",
      role: t("testimonialRole2"),
      company: "E-Commerce Plus",
      content: t("testimonialMichael"),
      rating: 5,
    },
    {
      name: "Fatou Ndiaye",
      role: t("testimonialRole3"),
      company: "GlobalTrade Co.",
      content: t("testimonialEmma"),
      rating: 5,
    },
    {
      name: "David Kouamé",
      role: t("testimonialRole4"),
      company: "FastFood Express",
      content: t("testimonialDavid"),
      rating: 5,
    },
    {
      name: "Claire Tchamba",
      role: t("testimonialRole5"),
      company: "Beauty & Style",
      content: t("testimonialLisa"),
      rating: 5,
    },
    {
      name: "Olivier Nguema",
      role: t("testimonialRole6"),
      company: "Immo Pro",
      content: t("testimonialTom"),
      rating: 5,
    },
  ]

  const companies = [
    { name: "DigiServ", logo: "DS", color: "from-blue-500 to-blue-600" },
    { name: "AfriTech", logo: "AT", color: "from-emerald-500 to-teal-600" },
    { name: "GlobalTrade", logo: "GT", color: "from-purple-500 to-indigo-600" },
    { name: "FastExpress", logo: "FE", color: "from-orange-500 to-red-500" },
    { name: "CloudAfrica", logo: "CA", color: "from-cyan-500 to-blue-500" },
    { name: "MediaPro", logo: "MP", color: "from-rose-500 to-pink-600" },
  ]

  return (
    <section className="py-20 sm:py-32 bg-white dark:bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {t("testimonialsTitle")}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t("testimonialsSubtitle")}
            </p>
          </motion.div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6"
            >
              <div className="flex mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <p className="text-gray-700 dark:text-gray-300 mb-6">
                &ldquo;{testimonial.content}&rdquo;
              </p>
              <div className="flex items-center">
                <div className={`h-12 w-12 rounded-full mr-4 flex items-center justify-center text-white font-bold text-sm ${avatarColors[index % avatarColors.length]} ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-800 ring-${avatarColors[index % avatarColors.length].replace('bg-', '')}/30 shadow-lg`}>
                  {getInitials(testimonial.name)}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {testimonial.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {testimonial.role} • {testimonial.company}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="border-t pt-12"
        >
          <p className="text-center text-sm text-muted-foreground mb-8">
            {t("trustedByCompanies")}
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8">
            {companies.map((company) => (
              <div
                key={company.name}
                className="flex items-center space-x-2 text-gray-400"
              >
                <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${company.color} flex items-center justify-center shadow-md`}>
                  <span className="text-sm font-bold text-white">{company.logo}</span>
                </div>
                <span className="text-lg font-semibold text-gray-600 dark:text-gray-400">{company.name}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}