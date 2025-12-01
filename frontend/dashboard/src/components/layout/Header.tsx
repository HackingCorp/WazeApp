'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Menu, 
  Search, 
  Bell, 
  Settings, 
  Moon, 
  Sun, 
  Monitor,
  User,
  LogOut,
  ChevronDown,
  Globe,
  HelpCircle,
} from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/providers/I18nProvider';
import clsx from 'clsx';

interface HeaderProps {
  onMobileMenuToggle: () => void;
  sidebarCollapsed: boolean;
}

export function Header({ onMobileMenuToggle, sidebarCollapsed }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);

  const router = useRouter();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { t, locale, setLocale, availableLocales } = useI18n();

  // Mock notifications - in real app, these would come from API
  const notifications = [
    {
      id: '1',
      title: 'New conversation started',
      message: 'Customer John Doe initiated a chat',
      time: '2 min ago',
      unread: true,
    },
    {
      id: '2',
      title: 'Agent response time improved',
      message: 'AI Agent #1 average response: 1.2s',
      time: '1 hour ago',
      unread: true,
    },
    {
      id: '3',
      title: 'Weekly analytics ready',
      message: 'View your performance report',
      time: '1 day ago',
      unread: false,
    },
  ];

  const unreadCount = notifications.filter(n => n.unread).length;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const themeIcons = {
    light: Sun,
    dark: Moon,
    system: Monitor,
  };

  const ThemeIcon = themeIcons[theme];

  return (
    <header className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Left section */}
          <div className="flex items-center">
            {/* Mobile menu button */}
            <button
              type="button"
              className="md:hidden -ml-0.5 -mt-0.5 h-12 w-12 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-900 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-green-500"
              onClick={onMobileMenuToggle}
            >
              <span className="sr-only">{t('sidebar.expand')}</span>
              <Menu className="h-6 w-6" />
            </button>

            {/* Search */}
            <div className="flex-1 flex justify-center lg:justify-start">
              <div className="w-full max-w-lg lg:max-w-xs">
                <label htmlFor="search" className="sr-only">
                  {t('common.search')}
                </label>
                <form onSubmit={handleSearch} className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="search"
                    name="search"
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-green-500 focus:border-green-500 sm:text-sm"
                    placeholder={t('header.search')}
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </form>
              </div>
            </div>
          </div>

          {/* Right section */}
          <div className="ml-4 flex items-center md:ml-6 space-x-2">
            {/* Language selector */}
            <div className="relative">
              <button
                type="button"
                className="p-2 rounded-full text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                onClick={() => setLanguageMenuOpen(!languageMenuOpen)}
              >
                <Globe className="h-5 w-5" />
              </button>

              {languageMenuOpen && (
                <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                  {availableLocales.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => {
                        setLocale(lang.code);
                        setLanguageMenuOpen(false);
                      }}
                      className={clsx(
                        'flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700',
                        locale === lang.code && 'bg-green-50 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                      )}
                    >
                      <span className="mr-3 text-lg">{lang.flag}</span>
                      {lang.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Theme selector */}
            <div className="relative">
              <button
                type="button"
                className="p-2 rounded-full text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                onClick={() => setThemeMenuOpen(!themeMenuOpen)}
              >
                <ThemeIcon className="h-5 w-5" />
              </button>

              {themeMenuOpen && (
                <div className="origin-top-right absolute right-0 mt-2 w-32 rounded-md shadow-lg py-1 bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                  {(['light', 'dark', 'system'] as const).map((themeName) => {
                    const Icon = themeIcons[themeName];
                    return (
                      <button
                        key={themeName}
                        onClick={() => {
                          setTheme(themeName);
                          setThemeMenuOpen(false);
                        }}
                        className={clsx(
                          'flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 capitalize',
                          theme === themeName && 'bg-green-50 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                        )}
                      >
                        <Icon className="mr-3 h-4 w-4" />
                        {t(`header.theme.${themeName}`)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Help */}
            <button
              type="button"
              className="p-2 rounded-full text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              onClick={() => router.push('/help')}
            >
              <HelpCircle className="h-5 w-5" />
            </button>

            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                className="p-2 rounded-full text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 block h-2 w-2 rounded-full bg-red-400 ring-2 ring-white dark:ring-gray-900"></span>
                )}
              </button>

              {notificationsOpen && (
                <div className="origin-top-right absolute right-0 mt-2 w-80 rounded-md shadow-lg py-1 bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                  <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                      {t('header.notifications')} {unreadCount > 0 && `(${unreadCount})`}
                    </h3>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={clsx(
                          'px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer',
                          notification.unread && 'bg-green-50 dark:bg-green-900/20'
                        )}
                      >
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {notification.title}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          {notification.time}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700">
                    <button
                      className="text-sm text-green-600 hover:text-green-700 dark:text-green-400"
                      onClick={() => router.push('/notifications')}
                    >
                      {t('header.viewAllNotifications')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* User menu */}
            <div className="relative">
              <button
                type="button"
                className="max-w-xs bg-white dark:bg-gray-900 rounded-full flex items-center text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
              >
                <span className="sr-only">{t('header.profile')}</span>
                <img
                  className="h-8 w-8 rounded-full"
                  src={user?.avatar || `https://ui-avatars.com/api/?name=${user?.firstName}+${user?.lastName}&background=059669&color=fff`}
                  alt={user?.firstName}
                />
                <ChevronDown className="ml-2 h-4 w-4 text-gray-400" />
              </button>

              {userMenuOpen && (
                <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                  <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {user?.email}
                    </p>
                  </div>
                  
                  <button
                    onClick={() => {
                      router.push('/profile');
                      setUserMenuOpen(false);
                    }}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <User className="mr-3 h-4 w-4" />
                    {t('header.profile')}
                  </button>
                  
                  <button
                    onClick={() => {
                      router.push('/settings');
                      setUserMenuOpen(false);
                    }}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <Settings className="mr-3 h-4 w-4" />
                    {t('header.settings')}
                  </button>
                  
                  <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                  
                  <button
                    onClick={handleLogout}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <LogOut className="mr-3 h-4 w-4" />
                    {t('header.signOut')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Click outside handlers */}
      {(userMenuOpen || notificationsOpen || themeMenuOpen || languageMenuOpen) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setUserMenuOpen(false);
            setNotificationsOpen(false);
            setThemeMenuOpen(false);
            setLanguageMenuOpen(false);
          }}
        />
      )}
    </header>
  );
}