import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { getUserCurrency } from '../../utils/currency'
import { getBankDisplayName } from '../../utils/bank'

export default function EditBillModal({ bill, onClose, onSaved }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [name, setName] = useState(bill.name ?? '')
  const [amount, setAmount] = useState(String(bill.amount ?? ''))
  const [dueDay, setDueDay] = useState(String(bill.due_day ?? ''))
  const [bankId, setBankId] = useState(bill.bank_id ?? '')
  const [banks, setBanks] = useState([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('banks')
      .select('id, name, type, balance, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        if (data) setBanks(data)
      })
  }, [user.id])

  const handleSave = async () => {
    if (!name.trim()) { setError(t('billNameRequired')); return }
    if (!amount || isNaN(amount)) { setError(t('invalidAmount')); return }
    if (!dueDay || isNaN(dueDay) || dueDay < 1 || dueDay > 31) {
      setError(t('invalidDueDay'))
      return
    }
    if (!bankId) { setError(t('selectBank')); return }

    setSaving(true)
    const { error: dbError } = await supabase
      .from('bills')
      .update({
        name: name.trim(),
        amount: parseFloat(amount),
        due_day: parseInt(dueDay, 10),
        bank_id: bankId,
      })
      .eq('id', bill.id)

    if (dbError) {
      setError(dbError.message)
      setSaving(false)
    } else {
      onSaved()
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    const { error: dbError } = await supabase
      .from('bills')
      .update({ is_active: false })
      .eq('id', bill.id)

    if (dbError) {
      setError(dbError.message)
      setDeleting(false)
    } else {
      onSaved()
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} style={{ zIndex: 1 }} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-10" style={{ zIndex: 2 }}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
        <h2 className="text-lg font-bold text-gray-800 mb-6">{t('editBill')}</h2>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('billName')}</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder={t('billNamePlaceholder')}
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('amount')} ({getUserCurrency()})</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder="0"
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('dueDay')}</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder="1-31"
              type="number"
              min="1"
              max="31"
              value={dueDay}
              onChange={e => setDueDay(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('deductFrom')}</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              value={bankId}
              onChange={e => setBankId(e.target.value)}
            >
              {banks.length === 0 && (
                <option value="">{t('noBanksHint')}</option>
              )}
              {banks.map(bank => (
                <option key={bank.id} value={bank.id}>{getBankDisplayName(bank)}</option>
              ))}
            </select>
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
            disabled={saving || deleting}
            className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? '...' : t('save')}
          </button>
        </div>

        <button
          onClick={handleDelete}
          disabled={saving || deleting}
          className="w-full mt-3 py-3 rounded-xl border border-red-200 text-sm text-red-500 font-medium disabled:opacity-50"
        >
          {deleting ? '...' : t('deleteBill')}
        </button>
      </div>
    </div>
  )
}
