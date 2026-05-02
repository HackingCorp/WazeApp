import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { SocketProvider } from '@/providers/SocketProvider';
import { AuthProvider } from '@/providers/AuthProvider';
import { ToastProvider } from '@/providers/ToastProvider';
import { I18nProvider } from '@/providers/I18nProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PostHogProvider } from '@/providers/PostHogProvider';
import { EscalationListener } from '@/components/EscalationListener';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://app.wazeapp.ai'),
  title: 'WazeApp Dashboard - AI WhatsApp Agents',
  description: 'Comprehensive dashboard for managing AI-powered WhatsApp agents, analytics, and business automation',
  keywords: 'WhatsApp, AI, Automation, Dashboard, Analytics, Chatbot, Business',
  authors: [{ name: 'WazeApp Team' }],
  creator: 'WazeApp',
  publisher: 'WazeApp',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
  viewport: 'width=device-width, initial-scale=1',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#059669' },
    { media: '(prefers-color-scheme: dark)', color: '#10b981' },
  ],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'WazeApp Dashboard',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    siteName: 'WazeApp Dashboard',
    title: 'WazeApp Dashboard - AI WhatsApp Agents',
    description: 'Comprehensive dashboard for managing AI-powered WhatsApp agents',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'WazeApp Dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WazeApp Dashboard - AI WhatsApp Agents',
    description: 'Comprehensive dashboard for managing AI-powered WhatsApp agents',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Include precompiled Tailwind CSS */}
        <link rel="stylesheet" href="/global.css" />
        {/* Inline favicon - chat bubble icon matching unified branding */}
        <link
          rel="icon"
          type="image/svg+xml"
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
        <meta name="msapplication-TileColor" content="#22c55e" />
        <meta name="theme-color" content="#22c55e" />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <I18nProvider>
          <ThemeProvider>
            <AuthProvider>
              <PostHogProvider>
                <ErrorBoundary>
                  <SocketProvider>
                    <EscalationListener />
                    <ToastProvider>
                      {children}
                    </ToastProvider>
                  </SocketProvider>
                </ErrorBoundary>
              </PostHogProvider>
            </AuthProvider>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
