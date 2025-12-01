import { createNavigation } from 'next-intl/navigation';
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'fr', 'es', 'de', 'it', 'pt', 'zh', 'ja', 'ar'],
  defaultLocale: 'en',
  localePrefix: 'as-needed'
});

export const { Link, redirect, usePathname, useRouter } = createNavigation(routing);

export const supportedLanguages = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' }
];

// Fonction pour détecter la langue préférée du navigateur
export function detectBrowserLanguage(): string {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'en';
  
  const browserLang = navigator.language.split('-')[0];
  const supportedCodes = supportedLanguages.map(lang => lang.code);
  
  return supportedCodes.includes(browserLang) ? browserLang : 'en';
}