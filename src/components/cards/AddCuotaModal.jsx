import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatMoney } from '../../utils/currency'

export default function AddCuotaModal({ card, onClose, onSaved }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [description, setDescription] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [numCuotas, setNumCuotas] = useState('')
  const [startDate, setStartDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const total = parseFloat(totalAmount)
  const count = parseInt(numCuotas, 10)
  const cuotaAmount = total > 0 && count > 0 ? total / count : 0

  const handleSave = async () => {
    if (!description.trim()) { setError(t('billNameRequired')); return }
    if (!totalAmount || isNaN(totalAmount) || total <= 0) { setError(t('invalidAmount')); return }
    if (!numCuotas || isNaN(numCuotas) || count < 1) { setError(t('invalidAmount')); return }
    if (!startDate) { setError(t('invalidDueDay')); return }

    setSaving(true)

    const { error: cuotaError } = await supabase.from('cuotas').insert({
      user_id: user.id,
      credit_card_id: card.id,
      description: description.trim(),
      total_amount: total,
      cuota_amount: cuotaAmount,
      total_cuotas: count,
      paid_cuotas: 0,
      start_date: startDate,
      is_active: true,
    })

    if (cuotaError) {
      setError(cuotaError.message)
      setSaving(false)
      return
    }

    const newBalance = (card.current_balance || 0) + total
    const { error: cardError } = await supabase
      .from('credit_cards')
      .update({ current_balance: newBalance })
      .eq('id', card.id)

    if (cardError) {
      setError(cardError.message)
      setSaving(false)
      return
    }

    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} style={{ zIndex: 1 }} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-10 max-h-[90vh] overflow-y-auto" style={{ zIndex: 2 }}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
        <h2 className="text-lg font-bold text-gray-800 mb-1">{t('addCuota')}</h2>
        <p className="text-sm text-gray-500 mb-6">{card.name}</p>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('cuotaDescription')}</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder="e.g. iPhone, TV"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('totalAmount')} (COP)</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder="0"
              type="number"
              value={totalAmount}
              onChange={e => setTotalAmount(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('numCuotas')}</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder="12"
              type="number"
              min="1"
              value={numCuotas}
              onChange={e => setNumCuotas(e.target.value)}
            />
          </div>

          {cuotaAmount > 0 && (
            <p className="text-xs text-gray-500">
              {t('cuotaAmount')}: {formatMoney(cuotaAmount, card.currency || 'COP')}
            </p>
          )}

          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('startDate')}</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
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
