import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhHans from './locales/zh-Hans';
import zhHant from './locales/zh-Hant';
import en from './locales/en';
import ja from './locales/ja';

const STORAGE_KEY = 'mahjong-lang';

const saved = localStorage.getItem(STORAGE_KEY);
const lng = saved && ['zh-Hans', 'zh-Hant', 'en', 'ja'].includes(saved) ? saved : 'zh-Hans';

i18n.use(initReactI18next).init({
  resources: {
    'zh-Hans': { translation: zhHans },
    'zh-Hant': { translation: zhHant },
    en: { translation: en },
    ja: { translation: ja },
  },
  fallbackLng: 'zh-Hans',
  supportedLngs: ['zh-Hans', 'zh-Hant', 'en', 'ja'],
  lng,
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
