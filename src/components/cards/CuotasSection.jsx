import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'

const formatMoney = (value, currency = 'COP') =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(value)

const getRemaining = (cuota) =>
  Math.max(0, (cuota.total_amount || 0) - (cuota.paid_cuotas || 0) * (cuota.cuota_amount || 0))

export default function CuotasSection({ card, refreshKey, onUpdated }) {
  const { t } = useTranslation()
  const [cuotas, setCuotas] = useState([])
  const [loading, setLoading] = useState(true)
  const [payingId, setPayingId] = useState(null)
  const [error, setError] = useState('')
  const [showEstimator, setShowEstimator] = useState(false)

  const currency = card.currency || 'COP'
  const currentBalance = card.current_balance || 0
  const monthlyCommitment = cuotas.reduce((sum, cuota) => sum + (cuota.cuota_amount || 0), 0)
  const estMinPayment = currency === 'USD'
    ? Math.max(currentBalance * 0.02, 25)
    : Math.max(currentBalance * 0.10, 50000)
  const showCuotaWarning = currentBalance > 0 && monthlyCommitment > currentBalance * 0.40

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

  if (loading) {
    return <p className="text-gray-400 text-xs py-2">{t('loading')}</p>
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <p className="text-[10px] font-medium tracking-wider text-gray-400 uppercase mb-2">
        {t('cuotas')}
      </p>

      {error && <p className="text-red-500 text-xs mb-2">{error}</p>}

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

      <div className="mt-3 pt-3 border-t border-gray-100">
        <button
          type="button"
          onClick={() => setShowEstimator(prev => !prev)}
          className="w-full text-left text-[10px] font-medium text-purple-600"
        >
          {showEstimator ? t('hideEstimator') : t('viewEstimator')}
        </button>

        {showEstimator && (
          <div className="mt-3 space-y-3">
            <p className="text-[10px] font-medium tracking-wider text-gray-400 uppercase">
              {t('estimator')}
            </p>

            {showCuotaWarning && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <p className="text-[10px] text-amber-800">{t('cuotaWarning')}</p>
              </div>
            )}

            <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-center gap-2">
                <p className="text-[10px] text-gray-500">{t('monthlyCommitment')}</p>
                <p className="text-xs font-semibold text-gray-800">{formatMoney(monthlyCommitment, currency)}</p>
              </div>
              <div className="flex justify-between items-center gap-2">
                <p className="text-[10px] text-gray-500">{t('estNextStatement')}</p>
                <p className="text-xs font-semibold text-gray-800">{formatMoney(currentBalance, currency)}</p>
              </div>
              <div className="flex justify-between items-center gap-2">
                <p className="text-[10px] text-gray-500">{t('estMinPayment')}</p>
                <p className="text-xs font-semibold text-gray-800">{formatMoney(estMinPayment, currency)}</p>
              </div>
            </div>

            {cuotas.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-gray-500 mb-2">{t('payoffTimeline')}</p>
                <div className="space-y-1.5">
                  {cuotas.map(cuota => {
                    const monthsLeft = Math.max(0, (cuota.total_cuotas || 0) - (cuota.paid_cuotas || 0))

                    return (
                      <div
                        key={cuota.id}
                        className="flex justify-between items-center gap-2 text-[10px]"
                      >
                        <p className="text-gray-600 truncate">{cuota.description}</p>
                        <p className="text-gray-400 shrink-0">{t('monthsRemaining', { count: monthsLeft })}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
