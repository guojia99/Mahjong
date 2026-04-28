import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import zhHans from './locales/zh-Hans';
import zhHant from './locales/zh-Hant';
import en from './locales/en';
import ja from './locales/ja';

const STORAGE_KEY = 'mahjong-lang';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'zh-Hans': { translation: zhHans },
      'zh-Hant': { translation: zhHant },
      'en': { translation: en },
      'ja': { translation: ja },
    },
    fallbackLng: 'zh-Hans',
    supportedLngs: ['zh-Hans', 'zh-Hant', 'en', 'ja'],
    lng: localStorage.getItem(STORAGE_KEY) || 'zh-Hans',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: STORAGE_KEY,
      caches: ['localStorage'],
    },
  });

export default i18n;
