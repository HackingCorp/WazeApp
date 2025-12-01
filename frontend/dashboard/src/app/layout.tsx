import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { SocketProvider } from '@/providers/SocketProvider';
import { AuthProvider } from '@/providers/AuthProvider';
import { ToastProvider } from '@/providers/ToastProvider';
import { I18nProvider } from '@/providers/I18nProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'WizeApp Dashboard - AI WhatsApp Agents',
  description: 'Comprehensive dashboard for managing AI-powered WhatsApp agents, analytics, and business automation',
  keywords: 'WhatsApp, AI, Automation, Dashboard, Analytics, Chatbot, Business',
  authors: [{ name: 'WizeApp Team' }],
  creator: 'WizeApp',
  publisher: 'WizeApp',
  robots: 'index,follow',
  viewport: 'width=device-width, initial-scale=1',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#059669' },
    { media: '(prefers-color-scheme: dark)', color: '#10b981' },
  ],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'WizeApp Dashboard',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    siteName: 'WizeApp Dashboard',
    title: 'WizeApp Dashboard - AI WhatsApp Agents',
    description: 'Comprehensive dashboard for managing AI-powered WhatsApp agents',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'WizeApp Dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WizeApp Dashboard - AI WhatsApp Agents',
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
        {/* Inline favicon to avoid 404s if public assets are absent */}
        <link
          rel="icon"
          type="image/svg+xml"
          href={
            `data:image/svg+xml,` +
            encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
                '<rect width="64" height="64" rx="12" fill="#059669"/>' +
                '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"' +
                ' font-family="Arial, Helvetica, sans-serif" font-size="36" fill="#fff">W</text>' +
              '</svg>'
            )
          }
        />
        {/* Remove external apple-touch and png icons to prevent 404s */}
        <link rel="manifest" href="/manifest.json" />
        <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#059669" />
        <meta name="msapplication-TileColor" content="#059669" />
        <meta name="theme-color" content="#059669" />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <ErrorBoundary>
          <I18nProvider>
            <ThemeProvider>
              <AuthProvider>
                <SocketProvider>
                  <ToastProvider>
                    {children}
                  </ToastProvider>
                </SocketProvider>
              </AuthProvider>
            </ThemeProvider>
          </I18nProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
