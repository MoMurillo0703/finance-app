import { useTranslation } from 'react-i18next'
import { formatMoney } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import { getBankDropdownLabel } from '../../utils/bank'
import { getPairCandidates } from '../../utils/transferMatcher'

export default function PairPickerSheet({ tx, transactions, banks = [], onPair, onClose }) {
  const { t } = useTranslation()
  const candidates = getPairCandidates(tx, transactions, { days: 3 })

  const bankLabel = (candidate) => {
    if (candidate.bank_name) return candidate.bank_name
    const bank = banks.find(b => b.id === candidate.bank_id)
    return bank ? getBankDropdownLabel(bank) : t('unknownAccount')
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} style={{ zIndex: 1 }} />
      <div
        className="relative bg-white w-full rounded-t-3xl pb-10 max-h-[80vh] overflow-y-auto"
        style={{ zIndex: 2 }}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-4" />
        <div className="px-6 pb-2 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-800">{t('linkTransfer')}</h3>
          <button type="button" onClick={onClose} className="text-sm text-gray-400 min-h-[44px] px-2">
            {t('cancel')}
          </button>
        </div>
        <p className="text-sm text-gray-500 px-6 pb-4">
          {t('linkTransferHint')}
        </p>
        {candidates.length === 0 ? (
          <p className="text-center text-gray-400 py-8 px-6">
            {t('noMatchingTransfers')}
          </p>
        ) : (
          candidates.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => onPair(tx, c)}
              className="w-full flex justify-between items-center px-6 py-4 border-b border-gray-50 text-left min-h-[44px]"
            >
              <div className="min-w-0 pr-3">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {(c.description || t('noDescription')).slice(0, 40)}
                  {(c.description || '').length > 40 ? '…' : ''}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatDate(c.transaction_date)} · {bankLabel(c)}
                </p>
              </div>
              <span className="text-sm font-semibold text-gray-700 shrink-0">
                {formatMoney(c.amount)}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
