'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  X,
  LayoutDashboard, 
  MessageSquare, 
  Bot, 
  BookOpen, 
  BarChart3, 
  Settings, 
  Users, 
  CreditCard,
  Zap,
  Image,
  Headphones,
} from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import { useAuth } from '@/providers/AuthProvider';
import { Logo } from '@/components/ui/Logo';
import clsx from 'clsx';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { user, hasPermission } = useAuth();

  const navigation = [
    {
      name: t('dashboard.title'),
      href: '/dashboard',
      icon: LayoutDashboard,
      permission: null,
    },
    {
      name: t('conversations.title'),
      href: '/conversations',
      icon: MessageSquare,
      permission: 'conversations.view',
      badge: '12',
    },
    {
      name: t('agents.title'),
      href: '/agents',
      icon: Bot,
      permission: 'agents.view',
    },
    {
      name: 'Knowledge Base',
      href: '/knowledge',
      icon: BookOpen,
      permission: 'knowledge.view',
    },
    {
      name: 'Media Library',
      href: '/media',
      icon: Image,
      permission: 'media.view',
    },
    {
      name: t('dashboard.analytics'),
      href: '/analytics',
      icon: BarChart3,
      permission: 'analytics.view',
    },
    {
      name: 'Automation',
      href: '/automation',
      icon: Zap,
      permission: 'automation.view',
    },
    {
      name: 'Team',
      href: '/team',
      icon: Users,
      permission: 'users.manage',
    },
    {
      name: 'Billing',
      href: '/billing',
      icon: CreditCard,
      permission: null,
    },
    {
      name: 'Support',
      href: '/support',
      icon: Headphones,
      permission: null,
    },
    {
      name: t('settings.title'),
      href: '/settings',
      icon: Settings,
      permission: null,
    },
  ];

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-50 bg-gray-600 bg-opacity-75 transition-opacity md:hidden"
        onClick={onClose}
      />
      
      {/* Mobile menu panel */}
      <div className="fixed inset-y-0 left-0 z-50 w-full max-w-sm bg-white dark:bg-gray-900 shadow-xl md:hidden">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200 dark:border-gray-700">
            <Logo collapsed={false} />
            <button
              type="button"
              className="p-2 -mr-2 rounded-md text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              onClick={onClose}
            >
              <span className="sr-only">Close menu</span>
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-6 py-6 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = pathname === item.href || (pathname && pathname.startsWith(item.href + '/'));
              const Icon = item.icon;

              // Check permissions
              if (item.permission && !hasPermission(item.permission)) {
                return null;
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={clsx(
                    'group flex items-center px-4 py-3 text-base font-medium rounded-lg transition-all duration-200',
                    isActive
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-r-2 border-green-600'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                  )}
                >
                  <Icon
                    className={clsx(
                      'mr-4 flex-shrink-0 h-6 w-6',
                      isActive
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300'
                    )}
                  />
                  <span className="flex-1">{item.name}</span>
                  {item.badge && (
                    <span className="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User info at bottom */}
          <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <img
                  className="h-10 w-10 rounded-full"
                  src={user?.avatar || `https://ui-avatars.com/api/?name=${user?.firstName}+${user?.lastName}&background=059669&color=fff`}
                  alt={user?.firstName}
                />
              </div>
              <div className="ml-3 min-w-0 flex-1">
                <p className="text-base font-medium text-gray-900 dark:text-white truncate">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                  {user?.organization?.name}
                </p>
              </div>
            </div>

            {/* Plan indicator */}
            <div className="mt-4 p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-700/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-300 uppercase tracking-wide">
                    {user?.organization?.plan} Plan
                  </p>
                  <p className="text-sm text-green-600 dark:text-green-400">
                    {user?.organization?.limits?.maxAgents} agents
                  </p>
                </div>
                <Link
                  href="/billing"
                  onClick={onClose}
                  className="text-sm text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium"
                >
                  Upgrade
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}