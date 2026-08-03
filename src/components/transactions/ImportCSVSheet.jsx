import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import Papa from 'papaparse'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { getBankDropdownLabel } from '../../utils/bank'
import { categoryForDb } from '../../utils/categories'
import { formatMoney } from '../../utils/currency'
import { runAutoMatchForUser } from '../../utils/transferMatcher'

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
  if (/ONLINE PAYMENT|PAYMENT THANK YOU|PAYMENT RECEIVED|AUTOPAY|PAYMENT - THANK/i.test(desc)) return 'Payment'

  return 'Other'
}

function detectCategoryMeta(desc, accountType) {
  const label = detectCategory(desc)
  if (label === 'Transfer') {
    return { category: 'transfer', forceType: null, isTransfer: true }
  }
  if (label === 'Payment') {
    return { category: 'utilities', forceType: 'payment', isTransfer: false }
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
  // Bank: positive = income, negative = expense
  // Card: positive = charge (expense), negative = payment
  if (accountType === 'card') {
    return {
      category: 'other',
      forceType: null,
      isTransfer: false,
      cardSigned: true,
    }
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

function stripOptionalColumns(payload, errorMessage) {
  let next = { ...payload }
  if (errorMessage.includes('is_transfer')) {
    const { is_transfer: _t, ...rest } = next
    next = rest
  }
  if (errorMessage.includes('balance_after')) {
    const { balance_after: _b, ...rest } = next
    next = rest
  }
  if (errorMessage.includes('source')) {
    const { source: _s, ...rest } = next
    next = rest
  }
  return next
}

const inputClass =
  'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white'

export default function ImportCSVSheet({ onClose, onImport, showToast }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const fileInputRef = useRef(null)

  const [accountType, setAccountType] = useState('bank')
  const [banks, setBanks] = useState([])
  const [creditCards, setCreditCards] = useState([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [file, setFile] = useState(null)
  const [bankName, setBankName] = useState('')
  const [currentBalance, setCurrentBalance] = useState('')
  const [pendingTotal, setPendingTotal] = useState('')
  const [preview, setPreview] = useState(null)
  const [rowCount, setRowCount] = useState(0)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    if (!user?.id) return

    let active = true

    async function fetchAccounts() {
      const [banksRes, cardsRes] = await Promise.all([
        supabase
          .from('banks')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('credit_cards')
          .select('*')
          .eq('user_id', user.id)
          .order('name'),
      ])

      if (!active) return

      if (banksRes.error) {
        console.error('Failed to fetch banks for import:', banksRes.error)
      }
      if (cardsRes.error) {
        console.error('Failed to fetch credit cards for import:', cardsRes.error)
      }

      setBanks(banksRes.data ?? [])
      setCreditCards(cardsRes.data ?? [])
    }

    fetchAccounts()
    return () => { active = false }
  }, [user?.id])

  useEffect(() => {
    setSelectedAccountId('')
  }, [accountType])

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
    if (!selectedAccountId) {
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
        const meta = detectCategoryMeta(r.description, accountType)
        let type = meta.forceType
        if (!type) {
          if (accountType === 'card') {
            type = r.amount > 0 ? 'expense' : 'payment'
          } else {
            type = r.amount > 0 ? 'income' : 'expense'
          }
        }
        return {
          ...r,
          category: meta.category,
          type,
          is_transfer: meta.isTransfer,
          amount: Math.abs(r.amount),
        }
      })

      let existingQuery = supabase
        .from('transactions')
        .select('id, transaction_date, amount, description')
        .eq('user_id', user.id)

      existingQuery = accountType === 'card'
        ? existingQuery.eq('credit_card_id', selectedAccountId)
        : existingQuery.eq('bank_id', selectedAccountId)

      const { data: allExisting } = await existingQuery

      let insertedCount = 0
      let updatedCount = 0

      for (const row of tagged) {
        const existing = allExisting?.find(e =>
          e.transaction_date === row.date
          && Math.abs(e.amount - row.amount) < 0.01,
        )

        if (existing) {
          let updatePayload = {
            category: categoryForDb(row.category),
            is_transfer: row.is_transfer,
            source: 'csv_import',
          }
          let { error: updateError } = await supabase
            .from('transactions')
            .update(updatePayload)
            .eq('id', existing.id)

          if (updateError && (updateError.message.includes('is_transfer') || updateError.message.includes('source'))) {
            updatePayload = stripOptionalColumns(updatePayload, updateError.message)
            ;({ error: updateError } = await supabase
              .from('transactions')
              .update(updatePayload)
              .eq('id', existing.id))
          }

          if (updateError) {
            setError(updateError.message)
            setImporting(false)
            return
          }
          updatedCount++
        } else {
          let insertPayload = {
            user_id: user.id,
            description: row.description,
            amount: row.amount,
            type: row.type,
            category: categoryForDb(row.category),
            transaction_date: row.date,
            is_transfer: row.is_transfer,
            balance_after: row.balance_after,
            bank_id: accountType === 'bank' ? selectedAccountId : null,
            credit_card_id: accountType === 'card' ? selectedAccountId : null,
            source: 'csv_import',
          }

          let { error: insertError } = await supabase.from('transactions').insert(insertPayload)

          if (insertError && (
            insertError.message.includes('is_transfer')
            || insertError.message.includes('balance_after')
            || insertError.message.includes('source')
          )) {
            insertPayload = stripOptionalColumns(insertPayload, insertError.message)
            ;({ error: insertError } = await supabase.from('transactions').insert(insertPayload))
          }

          if (insertError) {
            setError(insertError.message)
            setImporting(false)
            return
          }
          insertedCount++
        }
      }

      if (accountType === 'bank') {
        const { error: balanceError } = await supabase
          .from('banks')
          .update({ balance })
          .eq('id', selectedAccountId)
        if (balanceError) {
          setError(balanceError.message)
          setImporting(false)
          return
        }
      } else {
        const { error: balanceError } = await supabase
          .from('credit_cards')
          .update({ current_balance: balance })
          .eq('id', selectedAccountId)
        if (balanceError) {
          setError(balanceError.message)
          setImporting(false)
          return
        }
      }

      showToast?.(t('importNewAndUpdated', { imported: insertedCount, updated: updatedCount }))

      try {
        await runAutoMatchForUser(supabase, user.id, banks)
      } catch (matchErr) {
        console.error('Transfer auto-match failed:', matchErr)
      }

      onImport?.(insertedCount + updatedCount)
      onClose()
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setImporting(false)
    }
  }

  const activeBanks = banks.filter(b => b.is_active !== false)
  const activeCards = creditCards.filter(c => c.is_active !== false)

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
            <>
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

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
              {t('importToAccount')}
            </label>
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setAccountType('bank')}
                className="flex-1 py-2 rounded-xl text-sm font-medium min-h-[44px]"
                style={{
                  backgroundColor: accountType === 'bank' ? '#7C3AED' : '#F5F3FF',
                  color: accountType === 'bank' ? 'white' : '#7C3AED',
                }}
              >
                🏦 {t('importBankAccount')}
              </button>
              <button
                type="button"
                onClick={() => setAccountType('card')}
                className="flex-1 py-2 rounded-xl text-sm font-medium min-h-[44px]"
                style={{
                  backgroundColor: accountType === 'card' ? '#7C3AED' : '#F5F3FF',
                  color: accountType === 'card' ? 'white' : '#7C3AED',
                }}
              >
                💳 {t('creditCard')}
              </button>
            </div>

            {accountType === 'bank'
              ? (activeBanks.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">{t('noAccounts')}</p>
                ) : activeBanks.map(b => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedAccountId(b.id)}
                    className="w-full flex justify-between items-center p-4 rounded-2xl mb-2 text-left"
                    style={{
                      backgroundColor: selectedAccountId === b.id ? '#F5F3FF' : '#F9FAFB',
                      border: selectedAccountId === b.id ? '2px solid #7C3AED' : '2px solid transparent',
                    }}
                  >
                    <span className="font-medium text-gray-800">{getBankDropdownLabel(b)}</span>
                    <span className="text-gray-400 text-sm">{formatMoney(b.balance)}</span>
                  </button>
                )))
              : (activeCards.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">{t('noAccounts')}</p>
                ) : activeCards.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedAccountId(c.id)}
                    className="w-full flex justify-between items-center p-4 rounded-2xl mb-2 text-left"
                    style={{
                      backgroundColor: selectedAccountId === c.id ? '#F5F3FF' : '#F9FAFB',
                      border: selectedAccountId === c.id ? '2px solid #7C3AED' : '2px solid transparent',
                    }}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800">{c.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {c.issuing_bank ? `${c.issuing_bank} · ` : ''}
                        {formatMoney(c.current_balance)} {t('owed')}
                      </p>
                    </div>
                  </button>
                )))}
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
              {accountType === 'card'
                ? t('importCurrentCardBalance')
                : t('importCurrentBalance')}
              {' '}*
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
            </>
          )}
        </div>

        <div className="px-6 pb-8 pt-4 shrink-0 border-t border-gray-100">
          <button
            type="button"
            onClick={handleImport}
            disabled={importing || !file || !selectedAccountId || !currentBalance.trim()}
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
