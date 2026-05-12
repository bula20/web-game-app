// Konfiguracja i18next. Tłumaczenia są ładowane lazy z public/locales/{en,pl}/translation.json
// (HttpBackend), a język wykrywany jest z localStorage (preferencja usera) z fallbackiem
// na język przeglądarki. Wybrany język zapisujemy w localStorage, żeby utrzymać go między sesjami.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'pl'],
    interpolation: {
      escapeValue: false,
    },
    backend: {
      loadPath: '/locales/{{lng}}/translation.json',
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export default i18n;
