import type { Metadata, Viewport } from 'next';
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

// Next.js 14 requires viewport and themeColor in a separate viewport export,
// not inside metadata.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#059669' },
    { media: '(prefers-color-scheme: dark)', color: '#10b981' },
  ],
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
