import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'

export default function EditVaultModal({ vault, onClose, onSaved }) {
  const { t } = useTranslation()
  const [currentAmount, setCurrentAmount] = useState(String(vault.current_amount ?? ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (currentAmount === '' || isNaN(currentAmount)) {
      setError(t('invalidAmount'))
      return
    }

    setSaving(true)
    const { error: dbError } = await supabase
      .from('vaults')
      .update({ current_amount: parseFloat(currentAmount) })
      .eq('id', vault.id)

    if (dbError) {
      setError(dbError.message)
      setSaving(false)
    } else {
      onSaved()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} style={{ zIndex: 1 }} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-10" style={{ zIndex: 2 }}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
        <h2 className="text-lg font-bold text-gray-800 mb-1">{t('editVault')}</h2>
        <p className="text-sm text-gray-500 mb-6">{vault.name}</p>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('vaultCurrent')}</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder="0"
              type="number"
              value={currentAmount}
              onChange={e => setCurrentAmount(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-500"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? '...' : t('save')}
          </button>
        </div>
      </div>
    </div>
  )
}
