import { useAuth } from '../../context/AuthContext'
import { useTranslation } from 'react-i18next'

const TAB_TITLE_KEYS = {
  home: null,
  transactions: 'transactions',
  bills: 'bills',
  reports: 'reports',
  cards: 'creditCards',
  settings: 'settings',
}

export default function AppHeader({ activeTab }) {
  const { signOut } = useAuth()
  const { t } = useTranslation()

  const titleKey = TAB_TITLE_KEYS[activeTab]
  const title = titleKey ? t(titleKey) : 'Lala'

  return (
    <header className="fixed top-0 left-0 right-0 z-[100] bg-white border-b border-gray-100 flex items-center justify-between px-5 h-14">
      <span className={`text-lg font-bold ${activeTab === 'home' ? 'text-purple-600' : 'text-gray-800'}`}>
        {title}
      </span>
      <button
        type="button"
        onClick={signOut}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
        aria-label={t('logout')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        {t('logout')}
      </button>
    </header>
  )
}
