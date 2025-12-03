'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { detectBrowserLanguage } from '@/lib/i18n';

interface LanguageContextType {
  currentLanguage: string;
  changeLanguage: (lang: string) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [currentLanguage, setCurrentLanguage] = useState<string>('en');

  // Initialiser avec la langue du navigateur
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedLang = localStorage.getItem('wazeapp-language');
      const initialLang = savedLang || detectBrowserLanguage();
      setCurrentLanguage(initialLang);
    }
  }, []);

  // Écouter les changements de langue depuis d'autres composants
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleLanguageChange = (event: CustomEvent) => {
        setCurrentLanguage(event.detail.language);
      };

      window.addEventListener('languageChanged', handleLanguageChange as EventListener);
      
      return () => {
        window.removeEventListener('languageChanged', handleLanguageChange as EventListener);
      };
    }
  }, []);

  // Fonction pour changer de langue
  const changeLanguage = useCallback((newLang: string) => {
    setCurrentLanguage(newLang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('wazeapp-language', newLang);
      
      // Dispatch custom event pour notifier les autres composants
      window.dispatchEvent(new CustomEvent('languageChanged', { 
        detail: { language: newLang } 
      }));
    }
  }, []);

  return (
    <LanguageContext.Provider value={{ currentLanguage, changeLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}