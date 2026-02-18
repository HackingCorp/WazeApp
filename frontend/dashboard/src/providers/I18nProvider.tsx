'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { dashboardTranslations } from '@/lib/translations';

interface Translations {
  [key: string]: string | Translations;
}

interface I18nContextType {
  locale: string;
  setLocale: (locale: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  availableLocales: { code: string; name: string; flag: string }[];
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function useI18n() {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

const availableLocales = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Português', flag: '🇧🇷' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
];

// Use imported comprehensive translations
const translations: Record<string, Translations> = dashboardTranslations as Record<string, Translations>;

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState('en');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Load locale from localStorage or browser preference
    const savedLocale = localStorage.getItem('locale');
    const browserLocale = navigator.language.split('-')[0];
    const preferredLocale = savedLocale || browserLocale;
    
    if (availableLocales.find(l => l.code === preferredLocale)) {
      setLocaleState(preferredLocale);
    }
  }, []);

  const setLocale = (newLocale: string) => {
    if (availableLocales.find(l => l.code === newLocale)) {
      setLocaleState(newLocale);
      localStorage.setItem('locale', newLocale);
      
      // Update document language
      document.documentElement.lang = newLocale;
      
      // Update document direction for RTL languages
      document.documentElement.dir = newLocale === 'ar' ? 'rtl' : 'ltr';
    }
  };

  const t = (key: string, params?: Record<string, string | number>): string => {
    const keys = key.split('.');
    let value: any = translations[locale];

    for (const k of keys) {
      value = value?.[k];
    }

    if (typeof value !== 'string') {
      // Fallback to English if translation not found
      value = translations.en;
      for (const k of keys) {
        value = value?.[k];
      }
    }

    if (typeof value !== 'string') {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`Translation not found for key: ${key}`);
      }
      return key;
    }

    // Replace parameters
    if (params) {
      return value.replace(/\{\{(\w+)\}\}/g, (match, paramKey) => {
        return params[paramKey]?.toString() || match;
      });
    }

    return value;
  };

  if (!mounted) {
    return <div>{children}</div>;
  }

  return (
    <I18nContext.Provider
      value={{
        locale,
        setLocale,
        t,
        availableLocales,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}