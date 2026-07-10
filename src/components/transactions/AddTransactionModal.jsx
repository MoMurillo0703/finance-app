import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

export default function AddTransactionModal({ onClose, onSaved }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [type, setType] = useState('expense')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [bankId, setBankId] = useState('')
  const [banks, setBanks] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('banks')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .then(({ data }) => {
        if (data) {
          setBanks(data)
          if (data.length > 0) setBankId(data[0].id)
        }
      })
  }, [user.id])

  const handleSave = async () => {
    if (!amount || isNaN(amount)) { setError(t('invalidAmount')); return }
    if (!bankId) { setError(t('selectBank')); return }

    setSaving(true)

    const { error: txError } = await supabase.from('transactions').insert({
      user_id: user.id,
      bank_id: bankId,
      type,
      amount: parseFloat(amount),
      description: description.trim(),
      date,
    })

    if (txError) { setError(txError.message); setSaving(false); return }

    const { data: bankData } = await supabase
      .from('banks')
      .select('balance')
      .eq('id', bankId)
      .single()

    if (bankData) {
      const newBalance = type === 'income'
        ? bankData.balance + parseFloat(amount)
        : bankData.balance - parseFloat(amount)

      await supabase
        .from('banks')
        .update({ balance: newBalance })
        .eq('id', bankId)
    }

    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black opacity-40"
        onClick={onClose}
        style={{ zIndex: 1 }}
      />
      <div
        className="relative bg-white w-full rounded-t-3xl p-6 pb-10 max-h-[90vh] overflow-y-auto"
        style={{ zIndex: 2 }}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
        <h2 className="text-lg font-bold text-gray-800 mb-6">{t('addTransaction')}</h2>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="space-y-4">
          <div className="flex gap-3">
            <button
              onClick={() => setType('expense')}
              className={`flex-1 py-3 rounded-xl text-sm border ${type === 'expense' ? 'bg-red-500 text-white border-red-500' : 'border-gray-200 text-gray-500'}`}
            >
              {t('expense')}
            </button>
            <button
              onClick={() => setType('income')}
              className={`flex-1 py-3 rounded-xl text-sm border ${type === 'income' ? 'bg-green-500 text-white border-green-500' : 'border-gray-200 text-gray-500'}`}
            >
              {t('income')}
            </button>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('amount')} (COP)</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder="0"
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('description')}</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder={t('descriptionPlaceholder')}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('bank')}</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              value={bankId}
              onChange={e => setBankId(e.target.value)}
            >
              {banks.length === 0 && (
                <option value="">{t('noBanksHint')}</option>
              )}
              {banks.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('date')}</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
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
