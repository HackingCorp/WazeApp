'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileMenu } from './MobileMenu';
import { useAuth } from '@/providers/AuthProvider';
// import { useI18n } from '@/providers/I18nProvider';
import { Loader2 } from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user, isLoading } = useAuth();
  // const { t } = useI18n();
  const pathname = usePathname();

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

  return (
    <div className="h-screen flex overflow-hidden bg-gradient-to-b from-green-50 to-white dark:from-green-950/20 dark:to-gray-900 relative">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 -left-4 w-72 h-72 bg-green-200/30 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-pulse"></div>
        <div className="absolute -bottom-8 -right-4 w-96 h-96 bg-emerald-200/20 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-pulse" style={{animationDelay: '2s'}}></div>
      </div>
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
        {/* Header */}
        <Header 
          onMobileMenuToggle={() => setSidebarOpen(true)}
          sidebarCollapsed={sidebarCollapsed}
        />

        {/* Main content */}
        <main className="flex-1 relative overflow-y-auto focus:outline-none">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              {/* Page content */}
              <div className="animate-fade-in">
                {children}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Backdrop for mobile menu */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-gray-600 bg-opacity-75 transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}