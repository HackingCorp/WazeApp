'use client';

import Image from "next/image"
import { Star } from "lucide-react"
import { useTranslations } from "@/lib/hooks/use-translations"

export function TestimonialsSection() {
  const { t } = useTranslations()

  const testimonials = [
    {
      name: "Aminata Diallo",
      role: t("testimonialRole1"),
      company: "DigiServ Afrique",
      content: t("testimonialSarah"),
      rating: 5,
      image: "/images/testimonials/aminata.jpg",
    },
    {
      name: "Jean-Pierre Mbarga",
      role: t("testimonialRole2"),
      company: "E-Commerce Plus",
      content: t("testimonialMichael"),
      rating: 5,
      image: "/images/testimonials/jean-pierre.jpg",
    },
    {
      name: "Fatou Ndiaye",
      role: t("testimonialRole3"),
      company: "GlobalTrade Co.",
      content: t("testimonialEmma"),
      rating: 5,
      image: "/images/testimonials/fatou.jpg",
    },
    {
      name: "David Kouam\u00e9",
      role: t("testimonialRole4"),
      company: "FastFood Express",
      content: t("testimonialDavid"),
      rating: 5,
      image: "/images/testimonials/david.jpg",
    },
    {
      name: "Claire Tchamba",
      role: t("testimonialRole5"),
      company: "Beauty & Style",
      content: t("testimonialLisa"),
      rating: 5,
      image: "/images/testimonials/claire.jpg",
    },
    {
      name: "Olivier Nguema",
      role: t("testimonialRole6"),
      company: "Immo Pro",
      content: t("testimonialTom"),
      rating: 5,
      image: "/images/testimonials/olivier.jpg",
    },
  ]

  const companies = [
    { name: "MTN", logo: "/images/logos/mtn.png" },
    { name: "Orange", logo: "/images/logos/orange.png" },
    { name: "Jumia", logo: "/images/logos/jumia.png" },
    { name: "Flutterwave", logo: "/images/logos/flutterwave.png" },
    { name: "DHL", logo: "/images/logos/dhl.png" },
    { name: "Bolt", logo: "/images/logos/bolt.png" },
  ]

  return (
    <section className="py-20 sm:py-32 bg-white dark:bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <div className="animate-fade-in-up">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {t("testimonialsTitle")}
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t("testimonialsSubtitle")}
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {testimonials.map((testimonial, index) => (
            <div
              key={testimonial.name}
              className="animate-fade-in-up bg-gray-50 dark:bg-gray-800 rounded-xl p-6"
              style={{ animationDelay: `${index * 0.1}s` }}
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
                <Image
                  src={testimonial.image}
                  alt={testimonial.name}
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-full mr-4 object-cover ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-800 ring-primary/30 shadow-lg"
                />
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {testimonial.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {testimonial.role} • {testimonial.company}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="animate-fade-in border-t pt-12">
          <p className="text-center text-sm text-muted-foreground mb-8">
            {t("trustedByCompanies")}
          </p>
          <div className="flex flex-wrap justify-center items-center gap-10">
            {companies.map((company) => (
              <div
                key={company.name}
                className="flex items-center space-x-2 grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all duration-300"
              >
                <Image
                  src={company.logo}
                  alt={company.name}
                  width={40}
                  height={40}
                  className="rounded-lg"
                />
                <span className="text-lg font-semibold text-gray-600 dark:text-gray-400">{company.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
