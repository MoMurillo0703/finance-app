import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'

import { formatMoney, isCOPUser } from '../../utils/currency'
import CardEstimatorPanel from './CardEstimatorPanel'

const getRemaining = (cuota) =>
  Math.max(0, (cuota.total_amount || 0) - (cuota.paid_cuotas || 0) * (cuota.cuota_amount || 0))

export default function CuotasSection({ card, refreshKey, onUpdated, hideEstimator = false }) {
  const { t } = useTranslation()
  const [cuotas, setCuotas] = useState([])
  const [loading, setLoading] = useState(true)
  const [payingId, setPayingId] = useState(null)
  const [error, setError] = useState('')
  const [showEstimator, setShowEstimator] = useState(false)

  const currency = card.currency || 'COP'
  const currentBalance = card.current_balance || 0
  const showCuotaWarning = currentBalance > 0
    && cuotas.reduce((sum, c) => sum + (c.cuota_amount || 0), 0) > currentBalance * 0.40

  useEffect(() => {
    let active = true

    ;(async () => {
      const { data, error: fetchError } = await supabase
        .from('cuotas')
        .select('*')
        .eq('credit_card_id', card.id)
        .eq('is_active', true)
        .order('start_date')

      if (!active) return
      if (fetchError) setError(fetchError.message)
      else setCuotas(data ?? [])
      setLoading(false)
    })()

    return () => { active = false }
  }, [card.id, refreshKey])

  const handlePayCuota = async (cuota) => {
    if ((cuota.paid_cuotas || 0) >= (cuota.total_cuotas || 0)) return

    setPayingId(cuota.id)
    setError('')

    const newPaidCuotas = (cuota.paid_cuotas || 0) + 1
    const cuotaAmount = cuota.cuota_amount || 0
    const isComplete = newPaidCuotas >= (cuota.total_cuotas || 0)

    const { error: cuotaError } = await supabase
      .from('cuotas')
      .update({
        paid_cuotas: newPaidCuotas,
        is_active: isComplete ? false : true,
      })
      .eq('id', cuota.id)

    if (cuotaError) {
      setError(cuotaError.message)
      setPayingId(null)
      return
    }

    const newBalance = Math.max(0, (card.current_balance || 0) - cuotaAmount)
    const { error: cardError } = await supabase
      .from('credit_cards')
      .update({ current_balance: newBalance })
      .eq('id', card.id)

    if (cardError) {
      setError(cardError.message)
      setPayingId(null)
      return
    }

    setPayingId(null)
    onUpdated?.()
  }

  if (!isCOPUser()) return null

  if (loading) {
    return <p className="text-gray-400 text-xs py-2">{t('loading')}</p>
  }

  return (
    <div className={hideEstimator ? '' : 'mt-3 pt-3 border-t border-gray-100'}>
      <p className="text-[10px] font-medium tracking-wider text-gray-400 uppercase mb-2">
        {t('cuotas')}
      </p>

      {error && <p className="text-red-500 text-xs mb-2">{error}</p>}

      {showCuotaWarning && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
          <p className="text-[10px] text-amber-800">{t('cuotaWarning')}</p>
        </div>
      )}

      {cuotas.length === 0 ? (
        <p className="text-gray-400 text-xs">{t('noCuotas')}</p>
      ) : (
        <div className="space-y-2">
          {cuotas.map(cuota => {
            const paid = cuota.paid_cuotas || 0
            const total = cuota.total_cuotas || 0
            const remaining = getRemaining(cuota)
            const isPaidOff = paid >= total

            return (
              <div
                key={cuota.id}
                className="bg-gray-50 border border-gray-100 rounded-lg p-3"
              >
                <div className="flex justify-between items-start mb-1">
                  <p className="text-xs font-medium text-gray-700">{cuota.description}</p>
                  <p className="text-xs font-semibold text-gray-800">
                    {formatMoney(cuota.cuota_amount, currency)}
                  </p>
                </div>
                <p className="text-[10px] text-gray-400">
                  {t('cuotaProgress', { paid, total })} · {t('remainingCuotas')}: {formatMoney(remaining, currency)}
                </p>

                {!isPaidOff && (
                  <button
                    onClick={() => handlePayCuota(cuota)}
                    disabled={payingId === cuota.id}
                    className="w-full mt-2 py-1.5 rounded-lg bg-purple-600 text-white text-[10px] font-medium disabled:opacity-50"
                  >
                    {payingId === cuota.id ? '...' : t('payCuota')}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!hideEstimator && (
      <div className="mt-3 pt-3 border-t border-gray-100">
        <button
          type="button"
          onClick={() => setShowEstimator(prev => !prev)}
          className="w-full text-left text-[10px] font-medium text-purple-600"
        >
          {showEstimator ? t('hideEstimator') : t('viewEstimator')}
        </button>

        {showEstimator && (
          <div className="mt-3">
            <p className="text-[10px] font-medium tracking-wider text-gray-400 uppercase mb-3">
              {t('estimator')}
            </p>
            <CardEstimatorPanel card={card} cuotas={cuotas} />
          </div>
        )}
      </div>
      )}
    </div>
  )
}
