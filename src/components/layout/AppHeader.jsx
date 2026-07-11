import { Settings, LogOut } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useTranslation } from 'react-i18next'

const TAB_TITLE_KEYS = {
  home: null,
  transactions: 'transactions',
  bills: 'bills',
  accounts: 'accounts',
  reports: 'reports',
}

export default function AppHeader({ activeTab, onSettings }) {
  const { signOut } = useAuth()
  const { t } = useTranslation()

  const titleKey = TAB_TITLE_KEYS[activeTab]
  const title = titleKey ? t(titleKey) : 'Lala'

  return (
    <header className="fixed top-0 left-0 right-0 z-[100] bg-white border-b border-gray-100 flex items-center justify-between px-5 h-14">
      <span className={`text-lg font-bold ${activeTab === 'home' ? 'text-purple-600' : 'text-gray-800'}`}>
        {title}
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSettings}
          className="text-gray-500 hover:text-gray-700"
          aria-label={t('settings')}
        >
          <Settings size={20} />
        </button>
        <button
          type="button"
          onClick={signOut}
          className="text-gray-500 hover:text-gray-700 flex items-center gap-1 text-sm"
          aria-label={t('signOut')}
        >
          <LogOut size={16} />
          <span className="hidden sm:inline">{t('signOut')}</span>
        </button>
      </div>
    </header>
  )
}
