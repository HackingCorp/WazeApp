'use client';

import { useLanguage } from '@/components/providers/language-provider';
import { getTranslation, type TranslationKey } from '../translations';
import { useState, useEffect } from 'react';

export function useTranslations() {
  const { currentLanguage } = useLanguage();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const t = (key: TranslationKey): string => {
    // Use default language (English) during SSR
    const language = isClient ? currentLanguage : 'en';
    return getTranslation(language, key);
  };

  return { t };
}