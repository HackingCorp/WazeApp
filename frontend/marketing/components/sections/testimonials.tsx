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
    {
      name: "DigiServ",
      logo: (
        <svg viewBox="0 0 40 40" className="h-10 w-10">
          <rect width="40" height="40" rx="8" fill="#2563EB" />
          <path d="M10 12h8a8 8 0 010 16h-8V12z" fill="white" opacity="0.9" />
          <rect x="22" y="12" width="4" height="16" rx="2" fill="white" opacity="0.6" />
          <rect x="28" y="16" width="4" height="8" rx="2" fill="white" opacity="0.4" />
        </svg>
      ),
    },
    {
      name: "AfriTech",
      logo: (
        <svg viewBox="0 0 40 40" className="h-10 w-10">
          <rect width="40" height="40" rx="8" fill="#059669" />
          <polygon points="20,8 32,28 8,28" fill="white" opacity="0.9" />
          <polygon points="20,14 26,24 14,24" fill="#059669" />
          <circle cx="20" cy="22" r="2" fill="white" />
        </svg>
      ),
    },
    {
      name: "GlobalTrade",
      logo: (
        <svg viewBox="0 0 40 40" className="h-10 w-10">
          <rect width="40" height="40" rx="8" fill="#7C3AED" />
          <circle cx="20" cy="20" r="10" fill="none" stroke="white" strokeWidth="2" opacity="0.9" />
          <ellipse cx="20" cy="20" rx="5" ry="10" fill="none" stroke="white" strokeWidth="1.5" opacity="0.6" />
          <line x1="10" y1="20" x2="30" y2="20" stroke="white" strokeWidth="1.5" opacity="0.5" />
          <line x1="13" y1="14" x2="27" y2="14" stroke="white" strokeWidth="1" opacity="0.4" />
          <line x1="13" y1="26" x2="27" y2="26" stroke="white" strokeWidth="1" opacity="0.4" />
        </svg>
      ),
    },
    {
      name: "FastExpress",
      logo: (
        <svg viewBox="0 0 40 40" className="h-10 w-10">
          <rect width="40" height="40" rx="8" fill="#EA580C" />
          <path d="M8 20h16l-4-6h8l-12 12 4-6H8z" fill="white" opacity="0.9" />
        </svg>
      ),
    },
    {
      name: "CloudAfrica",
      logo: (
        <svg viewBox="0 0 40 40" className="h-10 w-10">
          <rect width="40" height="40" rx="8" fill="#0891B2" />
          <path d="M28 24H14a5 5 0 01-.5-9.97A7 7 0 0127 16a5 5 0 011 8z" fill="white" opacity="0.9" />
          <circle cx="22" cy="28" r="1.5" fill="white" opacity="0.5" />
          <circle cx="18" cy="30" r="1" fill="white" opacity="0.4" />
        </svg>
      ),
    },
    {
      name: "MediaPro",
      logo: (
        <svg viewBox="0 0 40 40" className="h-10 w-10">
          <rect width="40" height="40" rx="8" fill="#E11D48" />
          <rect x="8" y="12" width="16" height="16" rx="2" fill="white" opacity="0.9" />
          <polygon points="28,12 34,20 28,28" fill="white" opacity="0.7" />
          <circle cx="16" cy="20" r="4" fill="#E11D48" opacity="0.6" />
        </svg>
      ),
    },
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
                {company.logo}
                <span className="text-lg font-semibold text-gray-600 dark:text-gray-400">{company.name}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}