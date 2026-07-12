import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { DEFAULT_ADVANCED_FILTERS } from '../../utils/transactionFilters'

const DATE_PRESETS = [
  { labelKey: 'filterThisMonth', value: 'this_month' },
  { labelKey: 'filterLastMonth', value: 'last_month' },
  { labelKey: 'filterLast3Months', value: 'last_3_months' },
  { labelKey: 'filterThisYear', value: 'this_year' },
  { labelKey: 'filterCustom', value: 'custom' },
]

const TYPE_OPTIONS = [
  { labelKey: 'all', value: 'all' },
  { labelKey: 'filterIncomeOnly', value: 'income' },
  { labelKey: 'filterExpenseOnly', value: 'expense' },
]

const SORT_OPTIONS = [
  { labelKey: 'sortNewest', value: 'newest' },
  { labelKey: 'sortOldest', value: 'oldest' },
  { labelKey: 'sortHighest', value: 'highest' },
  { labelKey: 'sortLowest', value: 'lowest' },
]

const inputClass =
  'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white'

export default function FilterSheet({ appliedFilters, onClose, onApply }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(appliedFilters)

  useEffect(() => {
    setDraft(appliedFilters)
  }, [appliedFilters])

  const setField = (key, value) => setDraft(prev => ({ ...prev, [key]: value }))

  const clearAll = () => setDraft({ ...DEFAULT_ADVANCED_FILTERS })

  const applyAndClose = () => {
    onApply(draft)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh' }}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-2 shrink-0" />
        <div className="px-6 pb-2 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">{t('filters')}</h2>
        </div>

        <div className="flex-1 overflow-y-auto px-6 space-y-6 pb-4">
          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              {t('filterDateRange')}
            </p>
            <div className="flex flex-wrap gap-2">
              {DATE_PRESETS.map(({ labelKey, value }) => {
                const active = draft.datePreset === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setField('datePreset', active ? null : value)}
                    className="inline-flex items-center min-h-[44px] px-3 py-2 rounded-full text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: active ? '#7C3AED' : '#F5F3FF',
                      color: active ? 'white' : '#7C3AED',
                    }}
                  >
                    {t(labelKey)}
                  </button>
                )
              })}
            </div>
            {draft.datePreset === 'custom' && (
              <div className="flex gap-3 mt-3">
                <input
                  type="date"
                  value={draft.customFrom}
                  onChange={e => setField('customFrom', e.target.value)}
                  className={inputClass}
                  aria-label={t('filterFromDate')}
                />
                <input
                  type="date"
                  value={draft.customTo}
                  onChange={e => setField('customTo', e.target.value)}
                  className={inputClass}
                  aria-label={t('filterToDate')}
                />
              </div>
            )}
          </section>

          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              {t('filterType')}
            </p>
            <div className="grid grid-cols-3 gap-2 p-1 bg-gray-100 rounded-2xl">
              {TYPE_OPTIONS.map(({ labelKey, value }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setField('filterType', value)}
                  className={`inline-flex items-center justify-center min-h-[44px] py-2.5 rounded-xl text-xs font-medium transition-colors ${
                    draft.filterType === value
                      ? 'bg-white text-purple-700 shadow-sm'
                      : 'text-gray-500'
                  }`}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              {t('filterAmountRange')}
            </p>
            <div className="flex gap-3">
              <input
                type="number"
                inputMode="decimal"
                placeholder={t('filterMinAmount')}
                value={draft.minAmount}
                onChange={e => setField('minAmount', e.target.value)}
                className={`${inputClass} flex-1`}
              />
              <input
                type="number"
                inputMode="decimal"
                placeholder={t('filterMaxAmount')}
                value={draft.maxAmount}
                onChange={e => setField('maxAmount', e.target.value)}
                className={`${inputClass} flex-1`}
              />
            </div>
          </section>

          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              {t('filterSortBy')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SORT_OPTIONS.map(({ labelKey, value }) => {
                const active = draft.sortBy === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setField('sortBy', value)}
                    className="inline-flex items-center justify-center min-h-[44px] px-3 py-2 rounded-2xl text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: active ? '#7C3AED' : '#F5F3FF',
                      color: active ? 'white' : '#7C3AED',
                    }}
                  >
                    {t(labelKey)}
                  </button>
                )
              })}
            </div>
          </section>
        </div>

        <div className="flex gap-3 px-6 pb-8 pt-4 shrink-0 border-t border-gray-100">
          <button
            type="button"
            onClick={clearAll}
            className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-600 font-medium text-sm"
          >
            {t('clearAllFilters')}
          </button>
          <button
            type="button"
            onClick={applyAndClose}
            className="flex-1 py-3 rounded-2xl text-white font-semibold text-sm"
            style={{ backgroundColor: '#7C3AED' }}
          >
            {t('showResults')}
          </button>
        </div>
      </div>
    </div>
  )
}
