import { HeroSection } from "@/components/sections/hero-optimized"
import { FeaturesSection } from "@/components/sections/features"
import { TestimonialsSection } from "@/components/sections/testimonials"
import { StatsSection } from "@/components/sections/stats"

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <HeroSection />
      <FeaturesSection />
      <TestimonialsSection />
      <StatsSection />
    </div>
  )
}
