'use client';

import { useLanguage } from '@/components/providers/language-provider';
import { getTranslation, type TranslationKey } from '../translations';
import { useCallback } from 'react';

export function useTranslations() {
  const { currentLanguage, isHydrated } = useLanguage();

  const t = useCallback((key: TranslationKey): string => {
    // Use default language (English) during SSR, then switch to user language after hydration
    const language = isHydrated ? currentLanguage : 'en';
    return getTranslation(language, key);
  }, [currentLanguage, isHydrated]);

  return { t, isHydrated, currentLanguage };
}