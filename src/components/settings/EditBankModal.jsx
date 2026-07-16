import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { getUserCurrency } from '../../utils/currency'
import { updateBank, getBankAccountType, BANK_ACCOUNT_TYPES, legacyTypeFromAccountType } from '../../utils/bank'
import { useCurrencyInput, currencyAmountPlaceholder } from '../../hooks/useCurrencyInput'
import DeleteConfirmBlock from '../shared/DeleteConfirmBlock'

const inputClass =
  'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400'

export default function EditBankModal({ bank, onClose, onSaved }) {
  const { t } = useTranslation()
  const currency = getUserCurrency()
  const [name, setName] = useState(bank.name ?? '')
  const [nickname, setNickname] = useState(bank.nickname ?? '')
  const [lastFour, setLastFour] = useState(bank.last_four ?? '')
  const [accountType, setAccountType] = useState(getBankAccountType(bank))
  const balanceInput = useCurrencyInput(bank.balance ?? '')
  const [isActive, setIsActive] = useState(bank.is_active !== false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!name.trim()) {
      setError(t('billNameRequired'))
      return
    }
    if (!balanceInput.raw || balanceInput.numericValue < 0) {
      setError(t('invalidAmount'))
      return
    }

    setSaving(true)
    setError('')
    const { error: dbError } = await updateBank(supabase, bank.id, {
      name: name.trim(),
      nickname: nickname.trim() || null,
      type: legacyTypeFromAccountType(accountType),
      account_type: accountType,
      balance: balanceInput.numericValue,
      is_active: isActive,
      last_four: lastFour || null,
    })

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

    await supabase.from('transactions').delete().eq('bank_id', bank.id)

    const { error: dbError } = await supabase
      .from('banks')
      .update({ is_active: false })
      .eq('id', bank.id)

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
        <h2 className="text-lg font-bold text-gray-800 mb-6">{t('editBank')}</h2>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('bankName')}</label>
            <input className={inputClass} value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('accountNickname')}</label>
            <input className={inputClass} value={nickname} onChange={e => setNickname(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t('accountLastFour')}
            </label>
            <input
              type="text"
              maxLength={4}
              inputMode="numeric"
              placeholder={t('accountLastFourPlaceholder')}
              value={lastFour}
              onChange={e => setLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-full mt-2 px-4 py-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-purple-300"
            />
            <p className="text-xs text-gray-400 mt-1">
              {t('accountLastFourHint')}
            </p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t('accountType')}
            </label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {BANK_ACCOUNT_TYPES.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAccountType(opt.value)}
                  className="py-3 px-4 rounded-2xl text-sm font-medium border-2 transition-all"
                  style={{
                    borderColor: accountType === opt.value ? '#7C3AED' : '#E5E7EB',
                    backgroundColor: accountType === opt.value ? '#F5F3FF' : 'white',
                    color: accountType === opt.value ? '#7C3AED' : '#6B7280',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('currentBalance')} ({currency})</label>
            <input
              className={inputClass}
              type="text"
              inputMode="decimal"
              placeholder={currencyAmountPlaceholder(currency)}
              value={balanceInput.displayValue}
              onChange={balanceInput.handleChange}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
              className="rounded border-gray-300 text-purple-600"
            />
            <span className="text-sm text-gray-600">{t('activeAccount')}</span>
          </label>
        </div>

        <div className="flex gap-3 mt-6">
          <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-500">
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || deleting}
            className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? '...' : t('save')}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          disabled={saving || deleting}
          className="w-full py-3 rounded-2xl border border-red-200 text-red-500 text-sm font-medium mt-2 disabled:opacity-50"
        >
          {t('deleteAccount')}
        </button>

        <DeleteConfirmBlock
          show={showDeleteConfirm}
          message={t('deleteAccountConfirm')}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
          confirming={deleting}
          t={t}
        />
      </div>
    </div>
  )
}
