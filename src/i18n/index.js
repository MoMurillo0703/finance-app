import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import es from './es'
import en from './en'

function getInitialLanguage() {
  const saved = localStorage.getItem('language')
  if (saved) return saved
  if (navigator.language?.startsWith('es')) return 'es'
  return 'en'
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      es: es,
      en: en,
    },
    lng: getInitialLanguage(),
    fallbackLng: 'es',
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n