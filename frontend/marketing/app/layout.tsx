import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { LanguageProvider } from "@/components/providers/language-provider";
import { Navbar } from "@/components/navigation/navbar";
import { DemoChatWidget } from "@/components/sections/demo-chat";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WazeApp - Turn WhatsApp into Your AI Assistant",
  description: "Transform your WhatsApp into an intelligent customer engagement platform. Handle customer support, sales, and engagement 24/7. No coding required.",
  keywords: "WhatsApp AI, customer support, automation, chatbot, business communication",
  authors: [{ name: "WazeApp" }],
  creator: "WazeApp",
  openGraph: {
    title: "WazeApp - WhatsApp AI Assistant",
    description: "Turn your WhatsApp into an AI-powered customer engagement platform in 30 seconds.",
    url: "https://wazeapp.com",
    siteName: "WazeApp",
    images: [
      {
        url: "https://wazeapp.com/og-image.jpg",
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
    images: ["https://wazeapp.com/twitter-image.jpg"],
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body 
        className={inter.className} 
        suppressHydrationWarning={true}
      >
        {/* Inline favicon to avoid 404 when no file is present */}
        <link
          rel="icon"
          href={
            `data:image/svg+xml,` +
            encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
                '<rect width="64" height="64" rx="12" fill="#25D366"/>' +
                '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"' +
                ' font-family="Arial, Helvetica, sans-serif" font-size="36" fill="#fff">W</text>' +
              '</svg>'
            )
          }
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <LanguageProvider>
            <Navbar />
            <main>{children}</main>
            <DemoChatWidget />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
