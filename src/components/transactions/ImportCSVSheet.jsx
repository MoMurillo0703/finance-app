import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import Papa from 'papaparse'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { adjustBankBalance, bankDelta } from '../../lib/payments'
import { fetchBanks, getBankDropdownLabel } from '../../utils/bank'
import { categoryForDb } from '../../utils/categories'

function parseAmount(value) {
  if (value == null || value === '') return NaN
  const num = parseFloat(String(value).replace(/[$,\s]/g, ''))
  return Number.isNaN(num) ? NaN : num
}

function parseCsvDate(value) {
  if (!value) return null
  const str = String(value).trim()

  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  const slash = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (slash) {
    const [, mm, dd, yyyy] = slash
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }

  const d = new Date(str)
  if (!Number.isNaN(d.getTime())) {
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  return null
}

function isTransfer(desc) {
  if (!desc) return false
  const d = desc.toUpperCase()
  return (
    d.includes('ONLINE TRANSFER')
    || d.includes('ZELLE TO')
    || d.includes('ZELLE FROM')
    || d.includes('MOBILE TRANSFER')
    || d.includes('TRANSFER TO')
    || d.includes('TRANSFER FROM')
    || d.includes('ACH TRANSFER')
    || d.includes('WIRE TRANSFER')
    || d.includes('WT SEQ')
  )
}

function detectCategory(desc) {
  if (!desc) return 'Other'
  if (isTransfer(desc)) return 'Transfer'

  if (/HUMANA|BLUE SHIELD|UNITED HEALTH|MOLINA|KAISER|ELEVANCE|PRINCIPAL|TRANSAMERICA|BEAM|ASPEN|CHOICE ADMIN|UNIFIED TPA|BARRETT|AMERITAS|KP FINANCIAL|MOBILE DEPOSIT/i.test(desc)) {
    return 'Income'
  }
  if (/ATM WITHDRAWAL/i.test(desc)) return 'Cash'
  if (/^CHECK$/i.test(desc.trim()) || /^CHECK\s*#/i.test(desc)) return 'Check'
  if (/VENMO/i.test(desc)) return 'Transfer'
  if (/PAYROLL|SALARY|DIRECT DEP/i.test(desc)) return 'Income'

  return 'Other'
}

function detectCategoryMeta(desc) {
  const label = detectCategory(desc)
  if (label === 'Transfer') {
    return { category: 'transfer', forceType: null, isTransfer: true }
  }
  if (label === 'Income') {
    return { category: 'income', forceType: 'income', isTransfer: false }
  }
  if (label === 'Cash') {
    return { category: 'personal', forceType: 'expense', isTransfer: false }
  }
  if (label === 'Check') {
    return { category: 'other', forceType: 'expense', isTransfer: false }
  }
  return { category: 'other', forceType: null, isTransfer: false }
}

function detectBankName(headers, fileName) {
  const norms = headers.map(h => (h || '').trim().toLowerCase())
  if (norms.includes('amount') && (norms.includes('date') || norms.includes('description'))) {
    return 'Wells Fargo'
  }
  if (fileName && /wells|wf/i.test(fileName)) return 'Wells Fargo'
  return 'Bank CSV'
}

function parseWellsFargoRows(data) {
  return data
    .filter(r => {
      const status = r.STATUS || r.Status || r.status
      return !status || status === 'Posted'
    })
    .map(r => ({
      date: parseCsvDate(r.DATE || r.Date || r.date),
      description: (r.DESCRIPTION || r.Description || r.description || '').trim(),
      amount: parseAmount(r.AMOUNT ?? r.Amount ?? r.amount),
    }))
    .filter(r => r.date && r.description && !Number.isNaN(r.amount))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
}

const inputClass =
  'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white'

export default function ImportCSVSheet({ onClose, onImport, showToast }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const fileInputRef = useRef(null)

  const [banks, setBanks] = useState([])
  const [bankId, setBankId] = useState('')
  const [file, setFile] = useState(null)
  const [headers, setHeaders] = useState([])
  const [bankName, setBankName] = useState('')
  const [currentBalance, setCurrentBalance] = useState('')
  const [pendingTotal, setPendingTotal] = useState('')
  const [preview, setPreview] = useState(null)
  const [rowCount, setRowCount] = useState(0)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await fetchBanks(supabase, user.id, { orderByName: true })
      if (!active) return
      setBanks(data ?? [])
      if (data?.length === 1) setBankId(data[0].id)
    })()
    return () => { active = false }
  }, [user.id])

  const processFile = async (f) => {
    if (!f?.name?.toLowerCase().endsWith('.csv')) {
      setError(t('importCsvOnly'))
      return
    }

    setError('')
    setFile(f)
    const text = await f.text()
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true })
    const hdrs = parsed.meta.fields ?? []
    const rows = parseWellsFargoRows(parsed.data)

    setHeaders(hdrs)
    setBankName(detectBankName(hdrs, f.name))
    setPreview(rows.slice(0, 5))
    setRowCount(rows.length)
  }

  const handleFile = async (e) => {
    const f = e.target.files?.[0]
    if (f) await processFile(f)
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) await processFile(f)
  }

  const handleImport = async () => {
    if (!file) {
      setError(t('importCsvOnly'))
      return
    }
    if (!bankId) {
      setError(t('importSelectAccount'))
      return
    }
    if (!currentBalance.trim()) {
      setError(t('importCurrentBalanceRequired'))
      return
    }

    setImporting(true)
    setError('')

    try {
      const text = await file.text()
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true })
      const rows = parseWellsFargoRows(parsed.data)

      const balance = parseAmount(currentBalance)
      const pending = parseAmount(pendingTotal || '0') || 0
      if (Number.isNaN(balance)) {
        setError(t('importCurrentBalanceRequired'))
        setImporting(false)
        return
      }

      let runningBalance = balance - pending
      const withBalances = rows.map(r => {
        const balanceAfter = runningBalance
        runningBalance -= r.amount
        return { ...r, balance_after: balanceAfter }
      })

      const tagged = withBalances.map(r => {
        const meta = detectCategoryMeta(r.description)
        const type = meta.forceType || (r.amount > 0 ? 'income' : 'expense')
        return {
          ...r,
          category: meta.category,
          type,
          is_transfer: meta.isTransfer,
          amount: Math.abs(r.amount),
        }
      })

      const { data: existing } = await supabase
        .from('transactions')
        .select('transaction_date, amount, description')
        .eq('user_id', user.id)
        .eq('bank_id', bankId)

      const newRows = tagged.filter(r =>
        !existing?.some(e =>
          e.transaction_date === r.date
          && Math.abs(e.amount - r.amount) < 0.01
          && (e.description || '').toLowerCase() === r.description.toLowerCase(),
        ),
      )

      if (newRows.length > 0) {
        const basePayload = newRows.map(r => ({
          user_id: user.id,
          bank_id: bankId,
          description: r.description,
          amount: r.amount,
          type: r.type,
          category: categoryForDb(r.category),
          transaction_date: r.date,
          is_transfer: r.is_transfer,
          balance_after: r.balance_after,
        }))

        let { error: insertError } = await supabase.from('transactions').insert(basePayload)

        if (insertError && (insertError.message.includes('is_transfer') || insertError.message.includes('balance_after'))) {
          const fallbackPayload = basePayload.map(({ is_transfer: _t, balance_after: _b, ...row }) => row)
          ;({ error: insertError } = await supabase.from('transactions').insert(fallbackPayload))
        }

        if (insertError) {
          setError(insertError.message)
          setImporting(false)
          return
        }

        const delta = newRows.reduce((sum, row) => sum + bankDelta(row.type, row.amount), 0)
        const balanceError = await adjustBankBalance(bankId, delta)
        if (balanceError) {
          setError(balanceError.message)
          setImporting(false)
          return
        }
      }

      showToast?.(t('importNewCount', { count: newRows.length }))
      onImport?.(newRows.length)
      onClose()
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setImporting(false)
    }
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
        style={{ maxHeight: '92vh' }}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-2 shrink-0" />
        <div className="px-6 pb-2 shrink-0 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{t('importCsv')}</h2>
          <button type="button" onClick={onClose} className="text-sm text-gray-400 min-h-[44px] px-2">
            {t('cancel')}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 space-y-5 pb-4">
          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div
            role="button"
            tabIndex={0}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-purple-300'
            }`}
          >
            <p className="text-3xl mb-2">📄</p>
            <p className="text-sm font-medium text-gray-700">{t('importDropZoneBrowse')}</p>
            <p className="text-xs text-gray-400 mt-1">{t('importDropHint')}</p>
            {file && (
              <p className="text-xs text-purple-600 font-medium mt-3">{file.name}</p>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFile}
          />

          {preview?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {t('importDetectedBank', { bank: bankName })}
              </p>
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left px-3 py-2">{t('date')}</th>
                      <th className="text-left px-3 py-2">{t('description')}</th>
                      <th className="text-right px-3 py-2">{t('amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-t border-gray-50">
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{row.date}</td>
                        <td className="px-3 py-2 text-gray-800 max-w-[160px] truncate">{row.description}</td>
                        <td className="px-3 py-2 text-right text-gray-800 whitespace-nowrap">{row.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {t('importReadyCount', { count: rowCount })}
              </p>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
              {t('importToAccount')}
            </label>
            <select
              value={bankId}
              onChange={e => setBankId(e.target.value)}
              className={inputClass}
            >
              <option value="">{t('importSelectAccount')}</option>
              {banks.map(b => (
                <option key={b.id} value={b.id}>{getBankDropdownLabel(b)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
              {t('importCurrentBalance')} *
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={currentBalance}
              onChange={e => setCurrentBalance(e.target.value)}
              placeholder="0.00"
              className={inputClass}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
              {t('importPendingTotal')}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={pendingTotal}
              onChange={e => setPendingTotal(e.target.value)}
              placeholder="0"
              className={inputClass}
            />
          </div>
        </div>

        <div className="px-6 pb-8 pt-4 shrink-0 border-t border-gray-100">
          <button
            type="button"
            onClick={handleImport}
            disabled={importing || !file || !bankId || !currentBalance.trim()}
            className="w-full min-h-[44px] py-3 rounded-2xl text-white font-semibold text-sm disabled:opacity-50"
            style={{ backgroundColor: '#7C3AED' }}
          >
            {importing
              ? t('loading')
              : t('importButtonCount', { count: rowCount || 0 })}
          </button>
        </div>
      </div>
    </div>
  )
}
