import { useTranslation } from 'react-i18next'
import { Home, ArrowLeftRight, FileText, Landmark, BarChart2 } from 'lucide-react'

const TAB_CONFIG = [
  { key: 'home', labelKey: 'dashboard', icon: Home },
  { key: 'transactions', labelKey: 'transactions', icon: ArrowLeftRight },
  { key: 'bills', labelKey: 'bills', icon: FileText },
  { key: 'accounts', labelKey: 'accounts', icon: Landmark },
  { key: 'reports', labelKey: 'reports', icon: BarChart2 },
]

export default function BottomNav({ active, onChange }) {
  const { t } = useTranslation()

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex z-[125]">
      {TAB_CONFIG.map(tab => {
        const Icon = tab.icon
        const isActive = active === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`flex-1 flex flex-col items-center py-3 gap-1 ${
              isActive ? 'text-purple-600' : 'text-gray-400'
            }`}
          >
            <Icon size={22} strokeWidth={isActive ? 2.25 : 2} />
            <span className="text-[10px] leading-tight text-center">{t(tab.labelKey)}</span>
          </button>
        )
      })}
    </div>
  )
}
