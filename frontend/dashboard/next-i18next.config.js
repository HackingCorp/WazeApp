module.exports = {
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'fr', 'es', 'de', 'it', 'pt', 'zh', 'ja', 'ar'],
    localeDetection: true,
  },
  fallbackLng: 'en',
  debug: process.env.NODE_ENV === 'development',
  reloadOnPrerender: process.env.NODE_ENV === 'development',
};