'use client';

import { useState, useEffect, useCallback } from 'react';
import { detectBrowserLanguage } from '@/lib/i18n';

export function useLanguage() {
  const [currentLanguage, setCurrentLanguage] = useState<string>('en');

  // Initialiser avec la langue du navigateur
  useEffect(() => {
    const savedLang = localStorage.getItem('wizeapp-language');
    const initialLang = savedLang || detectBrowserLanguage();
    setCurrentLanguage(initialLang);
  }, []);

  // Écouter les changements de langue depuis d'autres composants
  useEffect(() => {
    const handleLanguageChange = (event: CustomEvent) => {
      setCurrentLanguage(event.detail.language);
    };

    window.addEventListener('languageChanged', handleLanguageChange as EventListener);
    
    return () => {
      window.removeEventListener('languageChanged', handleLanguageChange as EventListener);
    };
  }, []);

  // Fonction pour changer de langue
  const changeLanguage = useCallback((newLang: string) => {
    setCurrentLanguage(newLang);
    localStorage.setItem('wizeapp-language', newLang);
    
    // Dispatch custom event pour notifier les autres composants
    window.dispatchEvent(new CustomEvent('languageChanged', { 
      detail: { language: newLang } 
    }));
  }, []);

  return {
    currentLanguage,
    changeLanguage
  };
}