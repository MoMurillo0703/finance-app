import { useTranslation } from 'react-i18next'
import { formatMoney } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import { getBankDropdownLabel } from '../../utils/bank'
import { txTypeLabel, txAmountClass, txAmountPrefix } from '../../utils/transactionType'

export default function TransactionDetailModal({ transaction, onClose, onEdit }) {
  const { t } = useTranslation()

  const accountName =
    getBankDropdownLabel(transaction.banks)
    || transaction.credit_cards?.name
    || t('unknownAccount')

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} style={{ zIndex: 1 }} />
      <div className="relative bg-white w-full rounded-t-3xl p-6 pb-10 max-h-[90vh] overflow-y-auto" style={{ zIndex: 2 }}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />
        <h2 className="text-lg font-bold text-gray-800 mb-6">{t('transactionDetails')}</h2>

        <div className="space-y-4">
          <div>
            <p className="text-xs text-gray-400 mb-1">{t('description')}</p>
            <p className="text-sm text-gray-800">
              {transaction.description || txTypeLabel(transaction.type, t)}
            </p>
          </div>

          <div>
            <p className="text-xs text-gray-400 mb-1">{t('amount')}</p>
            <p className={`text-2xl font-bold ${txAmountClass(transaction.type)}`}>
              {txAmountPrefix(transaction.type)}{formatMoney(transaction.amount)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-1">{t('importType')}</p>
              <p className="text-sm text-gray-800">{txTypeLabel(transaction.type, t)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">{t('category')}</p>
              <p className="text-sm text-gray-800">{t(transaction.category, { defaultValue: transaction.category })}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-400 mb-1">{t('date')}</p>
            <p className="text-sm text-gray-800">{formatDate(transaction.transaction_date)}</p>
          </div>

          <div>
            <p className="text-xs text-gray-400 mb-1">{t('importToAccount')}</p>
            <p className="text-sm text-gray-800">{accountName}</p>
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-500"
          >
            {t('close')}
          </button>
          <button
            type="button"
            onClick={() => onEdit(transaction)}
            className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-medium"
          >
            {t('edit')}
          </button>
        </div>
      </div>
    </div>
  )
}
