import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { getUserCurrency } from '../../utils/currency'
import { useCurrencyInput, currencyAmountPlaceholder } from '../../hooks/useCurrencyInput'
import DeleteConfirmBlock from '../shared/DeleteConfirmBlock'

const inputClass =
  'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400'

export default function EditVaultModal({ vault, onClose, onSaved }) {
  const { t } = useTranslation()
  const currency = getUserCurrency()
  const [name, setName] = useState(vault.name ?? '')
  const targetInput = useCurrencyInput(vault.target_amount ?? '')
  const currentInput = useCurrencyInput(vault.current_amount ?? '')
  const [isActive, setIsActive] = useState(vault.is_active !== false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!name.trim()) { setError(t('billNameRequired')); return }
    if (!targetInput.raw || targetInput.numericValue < 0) { setError(t('invalidTargetAmount')); return }
    if (!currentInput.raw || currentInput.numericValue < 0) { setError(t('invalidAmount')); return }

    setSaving(true)
    setError('')
    const { error: dbError } = await supabase
      .from('vaults')
      .update({
        name: name.trim(),
        target_amount: targetInput.numericValue,
        current_amount: currentInput.numericValue,
        is_active: isActive,
      })
      .eq('id', vault.id)

    setSaving(false)
    if (dbError) {
      setError(dbError.message)
    } else {
      onSaved()
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    setError('')
    const { error: dbError } = await supabase
      .from('vaults')
      .update({ is_active: false, current_amount: 0 })
      .eq('id', vault.id)

    setDeleting(false)
    if (dbError) {
      setError(dbError.message)
    } else {
      onSaved()
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} style={{ zIndex: 1 }} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-10 max-h-[90vh] overflow-y-auto" style={{ zIndex: 2 }}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
        <h2 className="text-lg font-bold text-gray-800 mb-6">{t('editVault')}</h2>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('vaultName')}</label>
            <input className={inputClass} value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('vaultTarget', { currency })}</label>
            <input
              className={inputClass}
              type="text"
              inputMode="decimal"
              placeholder={currencyAmountPlaceholder(currency)}
              value={targetInput.displayValue}
              onChange={targetInput.handleChange}
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('vaultCurrent', { currency })}</label>
            <input
              className={inputClass}
              type="text"
              inputMode="decimal"
              placeholder={currencyAmountPlaceholder(currency)}
              value={currentInput.displayValue}
              onChange={currentInput.handleChange}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            <span className="text-sm text-gray-600">{t('activeAccount')}</span>
          </label>
        </div>

        <div className="flex gap-3 mt-6">
          <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-500">
            {t('cancel')}
          </button>
          <button type="button" onClick={handleSave} disabled={saving || deleting} className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-medium disabled:opacity-50">
            {saving ? '...' : t('save')}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          disabled={saving || deleting}
          className="w-full py-3 rounded-2xl border border-red-200 text-red-500 text-sm font-medium mt-2 disabled:opacity-50"
        >
          {t('deleteVault')}
        </button>

        <DeleteConfirmBlock
          show={showDeleteConfirm}
          message={t('deleteVaultConfirm')}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
          confirming={deleting}
          t={t}
        />
      </div>
    </div>
  )
}
