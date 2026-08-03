import { ISSUING_BANK_SUGGESTIONS } from '../../utils/cards'

const inputClass =
  'w-full mt-2 px-4 py-3 rounded-2xl border border-gray-200 text-sm outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-200'

export default function IssuingBankField({ value, onChange, label, placeholder }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        {label}
      </label>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={inputClass}
      />
      <div className="flex flex-wrap gap-2 mt-2">
        {ISSUING_BANK_SUGGESTIONS.map(bank => (
          <button
            key={bank}
            type="button"
            onClick={() => onChange(bank)}
            className="px-3 py-1.5 rounded-full text-xs font-medium"
            style={{
              backgroundColor: value === bank ? '#7C3AED' : '#F5F3FF',
              color: value === bank ? 'white' : '#7C3AED',
            }}
          >
            {bank}
          </button>
        ))}
      </div>
    </div>
  )
}
