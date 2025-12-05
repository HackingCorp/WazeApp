'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  BookOpen,
  Database,
  BarChart3,
  Settings,
  Users,
  CreditCard,
  PanelLeftClose,
  PanelLeftOpen,
  Zap,
  Image,
  Headphones,
  Smartphone,
  Radio,
} from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';
import { useAuth } from '@/providers/AuthProvider';
import { Logo } from '@/components/ui/Logo';
import clsx from 'clsx';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { user, hasPermission } = useAuth();

  const navigation = [
    {
      name: t('sidebar.dashboard'),
      href: '/dashboard',
      icon: LayoutDashboard,
      permission: null,
    },
    {
      name: t('sidebar.whatsapp'),
      href: '/dashboard/whatsapp',
      icon: Smartphone,
      permission: null,
    },
    {
      name: t('sidebar.conversations'),
      href: '/conversations',
      icon: MessageSquare,
      permission: null,
    },
    {
      name: t('sidebar.agents'),
      href: '/agents',
      icon: Bot,
      permission: null,
    },
    {
      name: t('sidebar.knowledgeBase'),
      href: '/knowledge-base',
      icon: Database,
      permission: null,
    },
    {
      name: t('sidebar.broadcast'),
      href: '/broadcast',
      icon: Radio,
      permission: null,
    },
  ];

  const secondaryNavigation = [
    {
      name: t('sidebar.billing'),
      href: '/billing',
      icon: CreditCard,
      permission: null,
    },
  ];

  const NavItem = ({ item, isSecondary = false }: { item: any, isSecondary?: boolean }) => {
    // More precise active state logic
    const isActive = pathname === item.href || 
      (pathname && pathname.startsWith(item.href + '/') && item.href !== '/dashboard');
    const Icon = item.icon;
    
    // Check permissions
    if (item.permission && !hasPermission(item.permission)) {
      return null;
    }

    return (
      <Link
        href={item.href}
        className={clsx(
          'group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200',
          isActive
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-r-2 border-green-600'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white',
          collapsed ? 'justify-center' : '',
          isSecondary && !collapsed ? 'ml-2' : ''
        )}
        title={collapsed ? item.name : undefined}
      >
        <Icon
          className={clsx(
            'flex-shrink-0',
            collapsed ? 'w-6 h-6' : 'w-5 h-5 mr-3',
            isActive
              ? 'text-green-600 dark:text-green-400'
              : 'text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300'
          )}
        />
        {!collapsed && (
          <>
            <span className="flex-1">{item.name}</span>
            {item.badge && (
              <span className="ml-auto inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                {item.badge}
              </span>
            )}
          </>
        )}
      </Link>
    );
  };

  return (
    <div
      className={clsx(
        'flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo and collapse button */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-700">
        <div className={clsx('flex items-center', collapsed ? 'justify-center w-full' : '')}>
          <Logo collapsed={collapsed} />
        </div>
        
        {!collapsed && (
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label={t('sidebar.collapse')}
          >
            <PanelLeftClose className="w-5 h-5" />
          </button>
        )}
        
        {collapsed && (
          <button
            onClick={onToggleCollapse}
            className="absolute top-4 -right-3 p-1 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shadow-sm hover:shadow-md transition-all"
            aria-label={t('sidebar.expand')}
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col p-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => (
          <NavItem key={item.href} item={item} />
        ))}

        {/* Divider */}
        <div className="my-6 border-t border-gray-200 dark:border-gray-700" />

        {/* Secondary navigation */}
        {secondaryNavigation.map((item) => (
          <NavItem key={item.href} item={item} isSecondary />
        ))}
      </nav>

      {/* User info at bottom */}
      {!collapsed && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <img
                className="w-8 h-8 rounded-full"
                src={user?.avatar || `https://ui-avatars.com/api/?name=${user?.firstName}+${user?.lastName}&background=059669&color=fff`}
                alt={user?.firstName}
              />
            </div>
            <div className="ml-3 min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {user?.organization?.name}
              </p>
            </div>
          </div>

          {/* Plan indicator */}
          <div className="mt-3 p-2 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-700/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-green-700 dark:text-green-300 uppercase tracking-wide">
                  {user?.organization?.plan} Plan
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  {user?.organization?.limits?.maxAgents} agents
                </p>
              </div>
              <Link
                href="/billing"
                className="text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium"
              >
                {t('sidebar.upgrade')}
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}