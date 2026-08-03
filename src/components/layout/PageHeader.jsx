import { Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function PageHeader({
  title,
  onSettings,
  light = false,
  actions = null,
  safeArea = true,
}) {
  const { t } = useTranslation()

  return (
    <div
      className="flex items-center justify-between px-5 pb-3"
      style={{
        paddingTop: safeArea
          ? 'calc(env(safe-area-inset-top) + 3.5rem)'
          : '1rem',
      }}
    >
      {title ? (
        <h1 className={`text-xl font-bold ${light ? 'text-white' : 'text-gray-900'}`}>
          {title}
        </h1>
      ) : (
        <div />
      )}
      <div className="flex items-center gap-2">
        {actions}
        <button
          type="button"
          onClick={onSettings}
          aria-label={t('settings')}
          className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center"
          style={{
            backgroundColor: light ? 'rgba(255,255,255,0.25)' : '#F5F3FF',
            backdropFilter: light ? 'blur(8px)' : 'none',
          }}
        >
          <Settings size={18} className={light ? 'text-white' : 'text-gray-600'} />
        </button>
      </div>
    </div>
  )
}
