import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import es from './es'
import en from './en'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      es: es,
      en: en,
    },
    lng: 'es',
    fallbackLng: 'es',
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n