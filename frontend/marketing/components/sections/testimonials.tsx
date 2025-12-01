'use client';

import Image from "next/image"
import { motion } from "framer-motion"
import { Star } from "lucide-react"
import { useTranslations } from "@/lib/hooks/use-translations"

export function TestimonialsSection() {
  const { t } = useTranslations()
  
  const testimonials = [
    {
      name: "Sarah Johnson",
      role: "CEO at TechStart",
      company: "TechStart Inc.",
      image: "https://i.pravatar.cc/150?img=1",
      content: t("testimonialSarah"),
      rating: 5,
    },
    {
      name: "Michael Chen",
      role: "Head of Sales",
      company: "E-Commerce Plus",
      image: "https://i.pravatar.cc/150?img=2",
      content: t("testimonialMichael"),
      rating: 5,
    },
    {
      name: "Emma Rodriguez",
      role: "Customer Success Manager",
      company: "Global Retail Co.",
      image: "https://i.pravatar.cc/150?img=3",
      content: t("testimonialEmma"),
      rating: 5,
    },
    {
      name: "David Kim",
      role: "Operations Director",
      company: "FastFood Chain",
      image: "https://i.pravatar.cc/150?img=4",
      content: t("testimonialDavid"),
      rating: 5,
    },
    {
      name: "Lisa Anderson",
      role: "Marketing Manager",
      company: "Beauty Brand",
      image: "https://i.pravatar.cc/150?img=5",
      content: t("testimonialLisa"),
      rating: 5,
    },
    {
      name: "Tom Wilson",
      role: "Founder",
      company: "Real Estate Pro",
      image: "https://i.pravatar.cc/150?img=6",
      content: t("testimonialTom"),
      rating: 5,
    },
  ]

  const companies = [
    { name: "TechCorp", logo: "TC" },
    { name: "StartupHub", logo: "SH" },
    { name: "GlobalRetail", logo: "GR" },
    { name: "FastDelivery", logo: "FD" },
    { name: "CloudServices", logo: "CS" },
    { name: "DigitalAgency", logo: "DA" },
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
                <Image
                  src={testimonial.image}
                  alt={testimonial.name}
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-full mr-4"
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
                <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <span className="text-sm font-bold">{company.logo}</span>
                </div>
                <span className="text-lg font-semibold">{company.name}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}