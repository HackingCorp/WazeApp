'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileMenu } from './MobileMenu';
import { useAuth } from '@/providers/AuthProvider';
import { api } from '@/lib/api';
// import { useI18n } from '@/providers/I18nProvider';
import { Loader2, ArrowRight, Sparkles, X, Lock, CreditCard } from 'lucide-react';
import { SupportChatWidget } from '@/components/support/SupportChatWidget';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user, isLoading } = useAuth();
  // const { t } = useI18n();
  const pathname = usePathname();

  // Onboarding banner state
  const [showOnboardingBanner, setShowOnboardingBanner] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [hasAgents, setHasAgents] = useState<boolean | null>(null);

  // Check if user needs onboarding (no agents created yet)
  useEffect(() => {
    if (!user || pathname?.startsWith('/onboarding')) return;

    // If dismissed this session, don't check again
    if (bannerDismissed) return;

    // If onboardingStep is set, always show banner
    if (user.onboardingStep != null) {
      setShowOnboardingBanner(true);
      return;
    }

    // Check if user has any agents — if not, show setup banner
    api.get('/agents').then((res: any) => {
      if (res.success) {
        const agents = res.data?.data || res.data || [];
        const count = Array.isArray(agents) ? agents.length : 0;
        setHasAgents(count > 0);
        if (count === 0) {
          setShowOnboardingBanner(true);
        }
      }
    }).catch(() => {});
  }, [user, pathname, bannerDismissed]);

  // Show loading screen while authenticating
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-green-50 to-white dark:from-green-950/20 dark:to-gray-900">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-green-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  // Check for token in URL params before redirecting
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const hasTokenParam = urlParams?.get('token');
  
  // Don't redirect if we have a token parameter or are still loading
  if (!user && !hasTokenParam) {
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-green-50 to-white dark:from-green-950/20 dark:to-gray-900">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Redirecting to login...
          </p>
        </div>
      </div>
    );
  }
  
  // Show loading if we have a token param but no user yet
  if (!user && hasTokenParam) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-green-50 to-white dark:from-green-950/20 dark:to-gray-900">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-green-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            Setting up your session...
          </p>
        </div>
      </div>
    );
  }

  // Full-width pages like conversations don't need gradient background
  const isFullWidthPage = pathname === '/conversations';

  // Pages accessible without active subscription
  const freePages = ['/dashboard', '/billing', '/profile', '/settings', '/help', '/onboarding'];
  const isPageLocked = user && !user.subscriptionActive && !freePages.some(p => pathname === p || pathname?.startsWith(p + '/'));

  return (
    <div className={`h-screen flex overflow-hidden relative ${isFullWidthPage ? 'bg-white dark:bg-gray-900' : 'bg-gradient-to-b from-green-50 to-white dark:from-green-950/20 dark:to-gray-900'}`}>
      {/* Background decoration - only show on pages with gradient */}
      {!isFullWidthPage && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 -left-4 w-72 h-72 bg-green-200/30 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-pulse"></div>
          <div className="absolute -bottom-8 -right-4 w-96 h-96 bg-emerald-200/20 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-pulse" style={{animationDelay: '2s'}}></div>
        </div>
      )}
      {/* Mobile menu */}
      <MobileMenu 
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Desktop sidebar */}
      <div className="hidden md:flex md:flex-shrink-0 relative z-10">
        <Sidebar 
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Main content area */}
      <div className="flex flex-col w-0 flex-1 overflow-hidden relative z-10">
        {/* Header - hide on full-width pages like conversations */}
        {pathname !== '/conversations' && (
          <Header
            onMobileMenuToggle={() => setSidebarOpen(true)}
            sidebarCollapsed={sidebarCollapsed}
          />
        )}

        {/* Onboarding banner */}
        {showOnboardingBanner && !bannerDismissed && (
          <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center">
              <Sparkles className="w-4 h-4 mr-2 flex-shrink-0" />
              <p className="text-sm font-medium">
                {user?.onboardingStep != null
                  ? 'Terminez la configuration de votre agent — Quelques minutes suffisent'
                  : 'Creez votre premier agent IA pour commencer a automatiser vos conversations WhatsApp'}
              </p>
            </div>
            <div className="flex items-center gap-2 ml-4 flex-shrink-0">
              <Link
                href={user?.onboardingStep != null ? `/onboarding?step=${user.onboardingStep}` : '/onboarding?step=1'}
                className="flex items-center text-sm font-medium bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors"
              >
                {user?.onboardingStep != null ? 'Reprendre' : 'Commencer'}
                <ArrowRight className="w-3 h-3 ml-1" />
              </Link>
              <button
                onClick={() => setBannerDismissed(true)}
                className="p-1 hover:bg-white/20 rounded transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 relative overflow-y-auto focus:outline-none">
          {isPageLocked ? (
            <div className="flex-1 flex items-center justify-center py-20">
              <div className="text-center max-w-md mx-auto px-4">
                <div className="w-16 h-16 mx-auto bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mb-5">
                  <Lock className="w-8 h-8 text-orange-500" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  Activez votre abonnement
                </h2>
                <p className="text-gray-500 dark:text-gray-400 mb-6">
                  Completez votre souscription pour acceder a toutes les fonctionnalites de WazeApp.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link
                    href={user?.onboardingStep != null ? `/onboarding?step=${user.onboardingStep}` : '/onboarding?step=3'}
                    className="inline-flex items-center justify-center px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    Choisir un forfait
                  </Link>
                  <Link
                    href="/billing"
                    className="inline-flex items-center justify-center px-5 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-medium"
                  >
                    Voir les forfaits
                  </Link>
                </div>
              </div>
            </div>
          ) : pathname === '/conversations' ? (
            <div className="h-full">
              {children}
            </div>
          ) : (
            <div className="py-6">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
                {/* Page content */}
                <div className="animate-fade-in">
                  {children}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Backdrop for mobile menu */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-gray-600 bg-opacity-75 transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Support Chat Widget */}
      <SupportChatWidget />
    </div>
  );
}