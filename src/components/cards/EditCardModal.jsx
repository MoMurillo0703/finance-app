import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { getUserCurrency } from '../../utils/currency'
import { useCurrencyInput, currencyAmountPlaceholder } from '../../hooks/useCurrencyInput'
import { syncAutoBillMinimum } from '../../utils/creditCard'
import DeleteConfirmBlock from '../shared/DeleteConfirmBlock'

const NETWORKS = ['Visa', 'Mastercard', 'Amex', 'Discover', 'Store']

const inputClass =
  'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400'

export default function EditCardModal({ card, onClose, onSaved }) {
  const { t } = useTranslation()
  const currency = getUserCurrency()
  const [name, setName] = useState(card.name ?? '')
  const [network, setNetwork] = useState(card.network ?? 'Visa')
  const creditLimitInput = useCurrencyInput(card.credit_limit ?? '')
  const currentBalanceInput = useCurrencyInput(card.current_balance ?? '')
  const [interestRate, setInterestRate] = useState(
    card.interest_rate != null ? String(card.interest_rate) : '',
  )
  const [statementDate, setStatementDate] = useState(
    card.statement_date != null ? String(card.statement_date) : '',
  )
  const [dueDate, setDueDate] = useState(card.due_date != null ? String(card.due_date) : '')
  const [hasIntroRate, setHasIntroRate] = useState(Boolean(card.intro_rate != null))
  const [introRate, setIntroRate] = useState(card.intro_rate != null ? String(card.intro_rate) : '')
  const [introRateExpires, setIntroRateExpires] = useState(
    card.intro_rate_expires ? card.intro_rate_expires.slice(0, 10) : '',
  )
  const [isActive, setIsActive] = useState(card.is_active !== false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (network === 'Store') {
      setHasIntroRate(false)
      setIntroRate('')
      setIntroRateExpires('')
    }
  }, [network])

  const handleAprChange = (setter) => (e) => {
    const val = e.target.value.replace(/[^\d.]/g, '')
    const parts = val.split('.')
    if (parts.length > 2) return
    if (parts[1]?.length > 2) return
    setter(val)
  }

  const handleDayChange = (setter) => (e) => {
    const val = e.target.value.replace(/\D/g, '')
    if (val === '' || (Number(val) >= 1 && Number(val) <= 31)) setter(val)
  }

  const handleSave = async () => {
    if (!name.trim()) { setError(t('billNameRequired')); return }
    if (!creditLimitInput.raw || creditLimitInput.numericValue <= 0) { setError(t('invalidAmount')); return }
    if (!currentBalanceInput.raw || currentBalanceInput.numericValue < 0) { setError(t('invalidAmount')); return }

    setSaving(true)
    setError('')

    const updates = {
      name: name.trim(),
      network,
      credit_limit: creditLimitInput.numericValue,
      current_balance: currentBalanceInput.numericValue,
      statement_date: statementDate ? parseInt(statementDate, 10) : card.statement_date,
      due_date: dueDate ? parseInt(dueDate, 10) : card.due_date,
      interest_rate: interestRate !== '' && !isNaN(interestRate) ? parseFloat(interestRate) : null,
      intro_rate: null,
      intro_rate_expires: null,
      is_active: isActive,
    }

    if (hasIntroRate && network !== 'Store') {
      if (introRate !== '' && !isNaN(introRate)) updates.intro_rate = parseFloat(introRate)
      if (introRateExpires) updates.intro_rate_expires = introRateExpires
    }

    const { data: updatedCard, error: dbError } = await supabase
      .from('credit_cards')
      .update(updates)
      .eq('id', card.id)
      .select('*')
      .single()

    if (dbError) {
      setError(dbError.message)
      setSaving(false)
      return
    }

    await supabase
      .from('bills')
      .update({
        name: `${name.trim()} - Minimum Payment`,
        due_day: updates.due_date,
      })
      .eq('credit_card_id', card.id)
      .eq('is_auto_card_bill', true)

    const { data: stmts } = await supabase
      .from('card_statements')
      .select('*')
      .eq('credit_card_id', card.id)
      .order('statement_date', { ascending: false })
      .limit(12)

    if (updatedCard) {
      await syncAutoBillMinimum(supabase, updatedCard, stmts ?? [])
    }

    setSaving(false)
    onSaved()
  }

  const handleDelete = async () => {
    setDeleting(true)
    setError('')

    await supabase.from('bills').update({ is_active: false }).eq('credit_card_id', card.id)
    await supabase.from('promotional_purchases').update({ is_active: false }).eq('credit_card_id', card.id)

    const { error: dbError } = await supabase
      .from('credit_cards')
      .update({ is_active: false })
      .eq('id', card.id)

    setDeleting(false)
    if (dbError) {
      setError(dbError.message)
    } else {
      onSaved()
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} style={{ zIndex: 1 }} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-10 max-h-[90vh] overflow-y-auto" style={{ zIndex: 2 }}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
        <h2 className="text-lg font-bold text-gray-800 mb-6">{t('editCard')}</h2>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('cardName')}</label>
            <input className={inputClass} value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('network')}</label>
            <div className="grid grid-cols-3 gap-2">
              {NETWORKS.slice(0, 3).map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNetwork(n)}
                  className={`py-2 rounded-xl text-xs border ${
                    network === n ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-500'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2 max-w-[66%] mx-auto">
              {NETWORKS.slice(3).map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNetwork(n)}
                  className={`py-2 rounded-xl text-xs border ${
                    network === n ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-500'
                  }`}
                >
                  {n === 'Store' ? `🏪 ${n}` : n}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">{t('creditLimit')} ({currency})</label>
              <input
                className={inputClass}
                type="text"
                inputMode="decimal"
                value={creditLimitInput.displayValue}
                onChange={creditLimitInput.handleChange}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">{t('balance')} ({currency})</label>
              <input
                className={inputClass}
                type="text"
                inputMode="decimal"
                value={currentBalanceInput.displayValue}
                onChange={currentBalanceInput.handleChange}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('interestRate')}</label>
            <input
              className={inputClass}
              placeholder="e.g. 24.99"
              inputMode="decimal"
              value={interestRate}
              onChange={handleAprChange(setInterestRate)}
            />
          </div>
          {network === 'Store' ? (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
              💡 {t('storePromoHint')}
            </div>
          ) : (
            <>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={hasIntroRate} onChange={e => setHasIntroRate(e.target.checked)} />
                <span className="text-sm text-gray-600">{t('hasIntroRate')}</span>
              </label>
              {hasIntroRate && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">{t('introRate')}</label>
                    <input className={inputClass} value={introRate} onChange={handleAprChange(setIntroRate)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">{t('introRateExpires')}</label>
                    <input className={inputClass} type="date" value={introRateExpires} onChange={e => setIntroRateExpires(e.target.value)} />
                  </div>
                </div>
              )}
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">{t('statementCloses')}</label>
              <input className={inputClass} inputMode="numeric" value={statementDate} onChange={handleDayChange(setStatementDate)} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">{t('paymentDue')}</label>
              <input className={inputClass} inputMode="numeric" value={dueDate} onChange={handleDayChange(setDueDate)} />
            </div>
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
          {t('deleteCard')}
        </button>

        <DeleteConfirmBlock
          show={showDeleteConfirm}
          message={t('deleteCardConfirm')}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
          confirming={deleting}
          t={t}
        />
      </div>
    </div>
  )
}
