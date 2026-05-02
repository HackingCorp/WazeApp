import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import dynamic from "next/dynamic";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { LanguageProvider } from "@/components/providers/language-provider";
import { Navbar } from "@/components/navigation/navbar";
import { PostHogProvider } from "@/components/providers/posthog-provider";

const DemoChatWidget = dynamic(
  () => import("@/components/sections/demo-chat").then((m) => ({ default: m.DemoChatWidget })),
  {
    ssr: false,
    loading: () => null,
  }
);

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://wazeapp.ai"),
  title: {
    default: "WazeApp - Transform WhatsApp into Your AI Assistant",
    template: "%s | WazeApp",
  },
  description: "Transform your WhatsApp into an intelligent customer engagement platform. Handle customer support, sales, and engagement 24/7. No coding required.",
  keywords: ["WhatsApp AI", "customer support", "automation", "chatbot", "business communication", "AI assistant", "WhatsApp bot"],
  authors: [{ name: "WazeApp", url: "https://wazeapp.ai" }],
  creator: "WazeApp",
  publisher: "WazeApp",
  alternates: {
    canonical: "/",
    languages: {
      "en": "/en",
      "fr": "/fr",
    },
  },
  openGraph: {
    title: "WazeApp - WhatsApp AI Assistant",
    description: "Turn your WhatsApp into an AI-powered customer engagement platform in 30 seconds.",
    url: "https://wazeapp.ai",
    siteName: "WazeApp",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "WazeApp - WhatsApp AI Assistant",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "WazeApp - WhatsApp AI Assistant",
    description: "Transform your WhatsApp into an intelligent AI assistant in 30 seconds.",
    images: ["/twitter-image.png"],
    creator: "@wazeapp",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: "your-google-verification-code",
  },
  category: "technology",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://wazeapp.ai/#organization",
      name: "WazeApp",
      url: "https://wazeapp.ai",
      logo: {
        "@type": "ImageObject",
        url: "https://wazeapp.ai/logo.png",
      },
      sameAs: [
        "https://twitter.com/wazeapp",
        "https://linkedin.com/company/wazeapp",
      ],
    },
    {
      "@type": "WebSite",
      "@id": "https://wazeapp.ai/#website",
      url: "https://wazeapp.ai",
      name: "WazeApp",
      publisher: {
        "@id": "https://wazeapp.ai/#organization",
      },
    },
    {
      "@type": "SoftwareApplication",
      name: "WazeApp",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: "Transform your WhatsApp into an intelligent AI-powered customer engagement platform.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.8",
        ratingCount: "10000",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={inter.className}
        suppressHydrationWarning={true}
      >
        {/* Inline favicon - chat bubble icon matching unified branding */}
        <link
          rel="icon"
          href={
            `data:image/svg+xml,` +
            encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
                '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0%" stop-color="#22c55e"/><stop offset="100%" stop-color="#16a34a"/>' +
                '</linearGradient></defs>' +
                '<rect width="64" height="64" rx="12" fill="url(#g)"/>' +
                '<g transform="translate(14,12)" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M34 20c0 9.4-8 17-18 17-3.2 0-6.2-.8-8.8-2.1L0 38l3-7.4C1.1 28 0 24.7 0 21.2 0 11.5 7.6 3.7 17 3.7h0C25.5 3.7 34 10.6 34 20z"/>' +
                '</g>' +
              '</svg>'
            )
          }
        />
        <link rel="apple-touch-icon" href="/logo-128.png" />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <LanguageProvider>
            <PostHogProvider>
              <Navbar />
              <main>{children}</main>
              <DemoChatWidget />
            </PostHogProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
