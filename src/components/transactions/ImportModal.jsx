import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import Papa from 'papaparse'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { adjustBankBalance, adjustCardBalance, bankDelta, cardDelta } from '../../lib/payments'
import { formatMoney, getUserCurrency } from '../../utils/currency'
import { getBankDropdownLabel, fetchBanks } from '../../utils/bank'
import { categoryForDb } from '../../utils/categories'
import { txTypeLabel, txBadgeClass } from '../../utils/transactionType'

const RULES = [
  { pattern: /interest charged|interest fee|finance charge/i, category: 'interest' },
  { pattern: /uber|lyft|taxi/i, category: 'transport' },
  { pattern: /walmart|target|costco|best.?buy|rei|officemax|wal.?mart|amazon/i, category: 'shopping' },
  { pattern: /restaurant|grill|cafe|coffee|sushi|tavern|brewing|wings|pizza|kitchen|diner|bbq|burger|taco|chipotle|mcdonald|starbucks|dunkin|tahoe|heirloom|doghouse|lazy.?dog|mad.?duck|kenjis|rustica/i, category: 'dining' },
  { pattern: /adobe|microsoft|google|openai|chatgpt|grammarly|tradingview|agencybloc|employee.?navigator|squarespace|sqsp/i, category: 'subscriptions' },
  { pattern: /vzwrlss|verizon|at&t|tmobile|sprint|xfinity|comcast/i, category: 'utilities' },
  { pattern: /pharmacy|cvs|walgreens|health|medical|doctor|dental|pediatric/i, category: 'health' },
  { pattern: /airline|flight|hotel|airbnb|airport|travel|newslink/i, category: 'travel' },
  { pattern: /netflix|spotify|hulu|disney|fandango|apple/i, category: 'entertainment' },
  { pattern: /arco|shell|chevron|exxon|mobil|bp|gas/i, category: 'gas' },
  { pattern: /insurance/i, category: 'insurance' },
  { pattern: /supercuts|salon|haircut|barber/i, category: 'personal' },
  { pattern: /ccoc|car\s?payment|auto\s?loan|auto\s?pay|motor/i, category: 'auto' },
  { pattern: /xcel|solutions|consulting/i, category: 'business' },
  { pattern: /napa\s?benefits|mvq\*/i, category: 'health' },
  { pattern: /chestnut|pediatric|medical|clinic|hospital/i, category: 'health' },
  { pattern: /kendel|rodas|stylist|spa/i, category: 'personal' },
]

const EXPENSE_CATEGORIES = [
  'transport', 'shopping', 'dining', 'subscriptions', 'utilities', 'health',
  'travel', 'entertainment', 'gas', 'insurance', 'personal', 'auto', 'business',
  'interest', 'other',
  'essential', 'food', 'fun', 'bills', 'debt', 'weeklyLiving', 'emergency',
]

const SKIP_PATTERNS = [
  /FOREIGN CURRENCY CONVERSION/i,
]

const PAYMENT_PATTERNS = [
  /ONLINE PAYMENT/i,
  /PAYMENT THANK YOU/i,
  /PAYMENT RECEIVED/i,
  /AUTOPAY/i,
  /PAYMENT - THANK/i,
]

const INTEREST_PATTERN = /interest charged|interest fee|finance charge/i

function cleanDescription(desc) {
  if (!desc) return ''
  if (/AMERICAN[0-9]/i.test(desc)) return 'American Airlines'
  if (/UNITED\s*[0-9]/i.test(desc)) return 'United Airlines'
  if (/DELTA\s*[0-9]/i.test(desc)) return 'Delta Airlines'
  if (/SOUTHWEST/i.test(desc)) return 'Southwest Airlines'
  if (/SKYAIRLIN/i.test(desc)) return 'Sky Airlines'
  return desc.replace(/\s+[A-Z]{2}$/, '').replace(/\s{2,}/g, ' ').trim()
}

function normalizeHeader(h) {
  return (h || '').trim().toLowerCase()
}

function findHeader(headers, ...candidates) {
  const normalized = headers.map(h => ({ raw: h, norm: normalizeHeader(h) }))
  for (const candidate of candidates) {
    const match = normalized.find(h => h.norm === candidate.toLowerCase())
    if (match) return match.raw
  }
  return null
}

function parseAmount(value) {
  if (value == null || value === '') return 0
  const cleaned = String(value).replace(/[$,\s]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
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
  if (!isNaN(d)) {
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  return null
}

function toDisplayDate(isoDate) {
  if (!isoDate) return ''
  const [yyyy, mm, dd] = isoDate.split('-')
  return `${mm}/${dd}/${yyyy}`
}

function detectCategory(description) {
  for (const rule of RULES) {
    if (rule.pattern.test(description)) return rule.category
  }
  return 'other'
}

function shouldSkip(description) {
  return SKIP_PATTERNS.some(p => p.test(description))
}

function isInterestCharge(description) {
  return INTEREST_PATTERN.test(description)
}

function detectFormat(headers) {
  const norms = headers.map(normalizeHeader)
  if (norms.includes('amount') && findHeader(headers, 'date', 'DATE')) {
    return {
      type: 'wellsFargo',
      dateCol: findHeader(headers, 'date', 'DATE'),
      descCol: findHeader(headers, 'description', 'DESCRIPTION'),
      amountCol: findHeader(headers, 'amount', 'AMOUNT'),
    }
  }
  if (norms.some(h => h === 'debit') && norms.some(h => h === 'credit')) {
    return {
      type: 'creditUnion',
      dateCol: findHeader(headers, 'date'),
      descCol: findHeader(headers, 'description'),
      debitCol: findHeader(headers, 'debit', 'Debit'),
      creditCol: findHeader(headers, 'credit', 'Credit'),
    }
  }
  return { type: 'unknown', headers }
}

function isPaymentDescription(description) {
  return PAYMENT_PATTERNS.some(p => p.test(description))
}

function isSignedFormat(mapping) {
  return mapping && ['wellsFargo', 'custom'].includes(mapping.type)
}

function finalizeRowsForAccount(rows, accountType, mapping) {
  return rows.map(row => {
    if (isPaymentDescription(row.description)) {
      return {
        ...row,
        type: 'payment',
        category: 'bills',
        checked: true,
      }
    }

    // Credit card CSVs (Wells Fargo AMOUNT): positive = charge, negative = payment
    if (accountType === 'card' && isSignedFormat(mapping) && row.rawAmount != null) {
      const raw = row.rawAmount
      if (raw > 0) {
        return {
          ...row,
          type: 'expense',
          amount: raw,
          category: detectCategory(row.description),
        }
      }
      if (raw < 0) {
        return {
          ...row,
          type: 'payment',
          amount: Math.abs(raw),
          category: 'bills',
        }
      }
    }

    // Bank account CSVs: negative payment to credit card = money leaving bank
    if (accountType === 'bank' && isPaymentDescription(row.description)) {
      return {
        ...row,
        type: 'payment',
        category: 'bills',
        checked: true,
      }
    }

    // Credit union credit column on card statements = payment, not income
    if (
      accountType === 'card'
      && mapping
      && ['creditUnion', 'customDebitCredit'].includes(mapping.type)
      && row.type === 'income'
    ) {
      return { ...row, type: 'payment', category: 'bills' }
    }

    return row
  })
}

function rowFromRecord(record, mapping) {
  const dateRaw = record[mapping.dateCol]
  const description = cleanDescription((record[mapping.descCol] || '').trim())
  let type = 'expense'
  let amount = 0
  let rawAmount = null

  if (mapping.type === 'wellsFargo') {
    const raw = parseAmount(record[mapping.amountCol])
    rawAmount = raw
    if (raw < 0) {
      type = 'expense'
      amount = Math.abs(raw)
    } else if (raw > 0) {
      type = 'income'
      amount = raw
    } else {
      return null
    }
  } else if (mapping.type === 'creditUnion' || mapping.type === 'customDebitCredit') {
    const debit = parseAmount(record[mapping.debitCol])
    const credit = parseAmount(record[mapping.creditCol])
    if (debit > 0) {
      type = 'expense'
      amount = debit
    } else if (credit > 0) {
      type = 'income'
      amount = credit
    } else {
      return null
    }
  } else {
    const raw = parseAmount(record[mapping.amountCol])
    rawAmount = raw
    if (raw < 0) {
      type = 'expense'
      amount = Math.abs(raw)
    } else if (raw > 0) {
      type = 'income'
      amount = raw
    } else {
      return null
    }
  }

  const isoDate = parseCsvDate(dateRaw)
  if (!isoDate || !description) return null

  const interest = isInterestCharge(description)
  const isPayment = isPaymentDescription(description)
  const skip = shouldSkip(description) || (interest && !isPayment)

  if (isPayment) {
    type = 'payment'
  }

  return {
    id: crypto.randomUUID(),
    date: isoDate,
    description,
    amount,
    rawAmount,
    type,
    category: type === 'payment' ? 'bills' : type === 'income' ? 'salary' : detectCategory(description),
    checked: !skip,
    isInterest: interest,
  }
}

function buildRows(data, mapping) {
  return data
    .map(record => rowFromRecord(record, mapping))
    .filter(Boolean)
}

function normalizeDesc(desc) {
  return desc.toLowerCase().replace(/\s+/g, ' ').trim()
}

function amountsSimilar(a, b) {
  if (Math.abs(a - b) <= 1) return true
  const avg = (Math.abs(a) + Math.abs(b)) / 2
  return avg > 0 && Math.abs(a - b) / avg <= 0.1
}

export default function ImportModal({ onClose, onComplete }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const fileInputRef = useRef(null)
  const currency = getUserCurrency()

  const [step, setStep] = useState(1)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [rawData, setRawData] = useState([])
  const [headers, setHeaders] = useState([])
  const [mapping, setMapping] = useState(null)
  const [customMap, setCustomMap] = useState({
    dateCol: '',
    descCol: '',
    amountMode: 'signed',
    amountCol: '',
    debitCol: '',
    creditCol: '',
  })
  const [rows, setRows] = useState([])
  const [interestAmount, setInterestAmount] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [importing, setImporting] = useState(false)
  const [summary, setSummary] = useState(null)
  const [showInterestPrompt, setShowInterestPrompt] = useState(false)
  const [pendingSummary, setPendingSummary] = useState(null)

  useEffect(() => {
    Promise.all([
      fetchBanks(supabase, user.id, { orderByName: true }),
      supabase.from('credit_cards').select('id, name').eq('user_id', user.id).eq('is_active', true).order('name'),
    ]).then(([banksRes, cardsRes]) => {
      const bankAccounts = (banksRes.data ?? []).map(b => ({
        id: b.id,
        name: getBankDropdownLabel(b),
        accountType: 'bank',
      }))
      const cardAccounts = (cardsRes.data ?? []).map(c => ({
        id: c.id,
        name: c.name,
        accountType: 'card',
      }))
      setAccounts([...bankAccounts, ...cardAccounts])
    })
  }, [user.id])

  const processParsedData = useCallback((data, hdrs) => {
    const format = detectFormat(hdrs)
    if (format.type === 'unknown') {
      setRawData(data)
      setHeaders(hdrs)
      setCustomMap({
        dateCol: hdrs[0] || '',
        descCol: hdrs[1] || '',
        amountMode: 'signed',
        amountCol: hdrs[2] || '',
        debitCol: hdrs.find(h => /debit/i.test(h)) || hdrs[2] || '',
        creditCol: hdrs.find(h => /credit/i.test(h)) || hdrs[3] || '',
      })
      setMapping(null)
      return
    }
    const built = buildRows(data, format)
    const interestRow = built.find(r => r.isInterest)
    setInterestAmount(interestRow ? interestRow.amount : null)
    setRows(built)
    setMapping(format)
    setStep(2)
  }, [])

  const parseFile = useCallback((file) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError(t('importCsvOnly'))
      return
    }
    setError('')
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const hdrs = results.meta.fields || []
        if (hdrs.length === 0 || results.data.length === 0) {
          setError(t('importEmptyCsv'))
          return
        }
        processParsedData(results.data, hdrs)
      },
      error: (err) => setError(err.message),
    })
  }, [processParsedData, t])

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file)
  }

  const applyCustomMapping = () => {
    if (!customMap.dateCol || !customMap.descCol) {
      setError(t('importMapRequired'))
      return
    }
    if (customMap.amountMode === 'signed' && !customMap.amountCol) {
      setError(t('importMapRequired'))
      return
    }
    if (customMap.amountMode === 'debitCredit' && (!customMap.debitCol || !customMap.creditCol)) {
      setError(t('importMapDebitCreditRequired'))
      return
    }

    const custom = customMap.amountMode === 'debitCredit'
      ? {
          type: 'customDebitCredit',
          dateCol: customMap.dateCol,
          descCol: customMap.descCol,
          debitCol: customMap.debitCol,
          creditCol: customMap.creditCol,
        }
      : {
          type: 'custom',
          dateCol: customMap.dateCol,
          descCol: customMap.descCol,
          amountCol: customMap.amountCol,
        }

    const built = buildRows(rawData, custom)
    const interestRow = built.find(r => r.isInterest)
    setInterestAmount(interestRow ? interestRow.amount : null)
    setRows(built)
    setMapping(custom)
    setError('')
    setStep(2)
  }

  const updateRow = (id, updates) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...updates } : r)))
  }

  const toggleType = (id) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r
      const type = r.type === 'expense' ? 'payment' : r.type === 'payment' ? 'income' : 'expense'
      return {
        ...r,
        type,
        category: type === 'payment' ? 'bills' : type === 'income' ? 'salary' : detectCategory(r.description),
      }
    }))
  }

  const getSelectedAccount = () =>
    accounts.find(a => a.id === selectedAccountId) || null

  const getAccountName = () => getSelectedAccount()?.name || ''

  const runImport = async () => {
    const account = getSelectedAccount()
    if (!account) {
      setError(t('importSelectAccount'))
      return
    }

    const checked = finalizeRowsForAccount(
      rows.filter(r => r.checked),
      account.accountType,
      mapping,
    )
    if (checked.length === 0) {
      setError(t('importNoRows'))
      return
    }

    setImporting(true)
    setError('')

    const bankId = account.accountType === 'bank' ? account.id : null
    const cardId = account.accountType === 'card' ? account.id : null

    const inserts = []
    const importedRows = []
    let skippedDuplicates = 0

    for (const row of checked) {
      const desc = row.description?.trim()
      if (desc) {
        let dupQuery = supabase
          .from('transactions')
          .select('id')
          .eq('user_id', user.id)
          .eq('transaction_date', row.date)
          .eq('amount', Math.abs(row.amount))
          .ilike('description', desc.substring(0, 20) + '%')
          .limit(1)

        if (cardId) {
          dupQuery = dupQuery.eq('credit_card_id', cardId)
        } else if (bankId) {
          dupQuery = dupQuery.eq('bank_id', bankId)
        }

        const { data: existing } = await dupQuery
        if (existing?.length > 0) {
          skippedDuplicates++
          continue
        }
      }

      importedRows.push(row)
      inserts.push({
        user_id: user.id,
        bank_id: bankId,
        credit_card_id: cardId,
        type: row.type,
        amount: row.amount,
        description: row.description,
        category: categoryForDb(row.category),
        transaction_date: row.date,
      })
    }

    try {
      if (inserts.length > 0) {
        const { data: inserted, error: insertError } = await supabase
          .from('transactions')
          .insert(inserts)
          .select('id')

        if (insertError) {
          console.error('Import insert failed:', insertError)
          setError(insertError.message)
          setImporting(false)
          return
        }

        if (!inserted || inserted.length === 0) {
          console.error('Import insert returned no rows — check RLS policies')
          setError(t('importInsertFailed'))
          setImporting(false)
          return
        }
      }

      let incomeTotal = 0
      let expenseTotal = 0
      importedRows.forEach(row => {
        if (row.type === 'income') incomeTotal += row.amount
        else expenseTotal += row.amount
      })

      if (bankId && importedRows.length > 0) {
        const delta = importedRows.reduce((sum, row) => sum + bankDelta(row.type, row.amount), 0)
        const balanceError = await adjustBankBalance(bankId, delta)
        if (balanceError) {
          console.error('Import bank balance update failed:', balanceError)
          setError(balanceError.message)
          setImporting(false)
          return
        }
      }

      if (cardId && importedRows.length > 0) {
        const delta = importedRows.reduce((sum, row) => sum + cardDelta(row.type, row.amount), 0)
        const balanceError = await adjustCardBalance(cardId, delta)
        if (balanceError) {
          console.error('Import card balance update failed:', balanceError)
          setError(balanceError.message)
          setImporting(false)
          return
        }
      }

      const summaryData = buildSummary(importedRows)
      setPendingSummary({
        count: importedRows.length,
        skippedDuplicates,
        incomeTotal,
        expenseTotal,
        ...summaryData,
      })

      setImporting(false)

      if (interestAmount && interestAmount > 0) {
        setShowInterestPrompt(true)
      } else {
        setSummary({
          count: importedRows.length,
          skippedDuplicates,
          incomeTotal,
          expenseTotal,
          ...summaryData,
        })
        setStep(4)
      }

      onComplete?.()
    } catch (err) {
      console.error('Import failed:', err)
      setError(err.message || String(err))
      setImporting(false)
    }
  }

  const buildSummary = (importedRows) => {
    const expenses = importedRows.filter(r => r.type === 'expense')
    const byCategory = {}
    expenses.forEach(r => {
      byCategory[r.category] = (byCategory[r.category] || 0) + r.amount
    })

    const descGroups = {}
    expenses.forEach(r => {
      const key = normalizeDesc(r.description)
      if (!descGroups[key]) descGroups[key] = { desc: r.description, amounts: [] }
      descGroups[key].amounts.push(r.amount)
    })

    const recurring = Object.values(descGroups)
      .filter(g => g.amounts.length >= 2)
      .filter(g => {
        const first = g.amounts[0]
        return g.amounts.every(a => amountsSimilar(a, first))
      })
      .map(g => ({ description: g.desc, amount: g.amounts[0] }))

    const dates = importedRows.map(r => new Date(r.date + 'T12:00:00')).filter(d => !isNaN(d))
    let monthlyEstimate = expenseTotalFrom(expenses)
    if (dates.length >= 2) {
      const min = Math.min(...dates.map(d => d.getTime()))
      const max = Math.max(...dates.map(d => d.getTime()))
      const days = Math.max(1, Math.round((max - min) / (1000 * 60 * 60 * 24)) + 1)
      monthlyEstimate = (monthlyEstimate / days) * 30
    }

    return { byCategory, recurring, monthlyEstimate }
  }

  function expenseTotalFrom(expenses) {
    return expenses.reduce((sum, r) => sum + r.amount, 0)
  }

  const handleInterestYes = async () => {
    const account = getSelectedAccount()
    if (!account) return

    const bankId = account.accountType === 'bank' ? account.id : null
    const cardId = account.accountType === 'card' ? account.id : null
    const today = new Date().toISOString().split('T')[0]

    try {
      const { error: insertError } = await supabase.from('transactions').insert({
        user_id: user.id,
        bank_id: bankId,
        credit_card_id: cardId,
        type: 'expense',
        amount: interestAmount,
        description: 'Interest charge',
        category: 'interest',
        transaction_date: today,
      })

      if (insertError) {
        console.error('Interest charge insert failed:', insertError)
        setError(insertError.message)
        return
      }

      if (bankId) await adjustBankBalance(bankId, -interestAmount)
      if (cardId) await adjustCardBalance(cardId, interestAmount)

      setShowInterestPrompt(false)
      setSummary(pendingSummary)
      setStep(4)
      onComplete?.()
    } catch (err) {
      console.error('Interest charge import failed:', err)
      setError(err.message || String(err))
    }
  }

  const handleInterestNo = () => {
    setShowInterestPrompt(false)
    setSummary(pendingSummary)
    setStep(4)
  }

  const categoryOptions = (type) => {
    if (type === 'income') return ['salary', 'commission', 'reimbursement']
    if (type === 'payment') return ['bills', 'debt']
    return EXPENSE_CATEGORIES
  }

  return (
    <div className="fixed inset-0 z-[110] bg-white flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="text-lg font-bold text-gray-800">{t('importCsv')}</h2>
        <button type="button" onClick={onClose} className="text-sm text-gray-400">{t('cancel')}</button>
      </div>

      <div className="px-6 py-2 border-b border-gray-50">
        <div className="flex gap-1">
          {[1, 2, 3, 4].map(s => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-purple-500' : 'bg-gray-200'}`}
            />
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {step === 1 && t('importStep1')}
          {step === 2 && t('importStep2')}
          {step === 3 && t('importStep3')}
          {step === 4 && t('importStep4')}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {step === 1 && (
          <div>
            {!mapping && headers.length === 0 ? (
              <>
                <div
                  role="button"
                  tabIndex={0}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors ${
                    dragOver ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-purple-300'
                  }`}
                >
                  <p className="text-4xl mb-3">📄</p>
                  <p className="text-sm font-medium text-gray-700">{t('importDropZone')}</p>
                  <p className="text-xs text-gray-400 mt-1">{t('importDropHint')}</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => e.target.files[0] && parseFile(e.target.files[0])}
                />
              </>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">{t('importMapColumns')}</p>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">{t('date')}</label>
                  <select
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
                    value={customMap.dateCol}
                    onChange={e => setCustomMap(prev => ({ ...prev, dateCol: e.target.value }))}
                  >
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">{t('description')}</label>
                  <select
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
                    value={customMap.descCol}
                    onChange={e => setCustomMap(prev => ({ ...prev, descCol: e.target.value }))}
                  >
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">{t('importAmountFormat')}</label>
                  <select
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
                    value={customMap.amountMode}
                    onChange={e => setCustomMap(prev => ({ ...prev, amountMode: e.target.value }))}
                  >
                    <option value="signed">{t('importSignedAmount')}</option>
                    <option value="debitCredit">{t('importDebitCredit')}</option>
                  </select>
                  {customMap.amountMode === 'signed' && (
                    <p className="text-xs text-gray-400 mt-1">{t('importSignedHint')}</p>
                  )}
                </div>
                {customMap.amountMode === 'signed' ? (
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">{t('amount')}</label>
                    <select
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
                      value={customMap.amountCol}
                      onChange={e => setCustomMap(prev => ({ ...prev, amountCol: e.target.value }))}
                    >
                      {headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">{t('importDebitCol')}</label>
                      <select
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
                        value={customMap.debitCol}
                        onChange={e => setCustomMap(prev => ({ ...prev, debitCol: e.target.value }))}
                      >
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">{t('importCreditCol')}</label>
                      <select
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
                        value={customMap.creditCol}
                        onChange={e => setCustomMap(prev => ({ ...prev, creditCol: e.target.value }))}
                      >
                        {headers.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
                <button
                  type="button"
                  onClick={applyCustomMapping}
                  className="w-full py-3 rounded-xl bg-purple-600 text-white text-sm font-medium"
                >
                  {t('next')}
                </button>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            {interestAmount != null && interestAmount > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
                <p className="text-sm text-amber-800">
                  {t('importInterestDetected', { amount: formatMoney(interestAmount, currency) })}
                </p>
              </div>
            )}
            <div className="overflow-x-auto border border-gray-100 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="p-2 w-8" />
                    <th className="p-2 text-left">{t('date')}</th>
                    <th className="p-2 text-left">{t('description')}</th>
                    <th className="p-2 text-left">{t('category')}</th>
                    <th className="p-2 text-left">{t('importType')}</th>
                    <th className="p-2 text-right">{t('amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.id} className="border-t border-gray-50">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={row.checked}
                          onChange={e => updateRow(row.id, { checked: e.target.checked })}
                        />
                      </td>
                      <td className="p-2 whitespace-nowrap">{toDisplayDate(row.date)}</td>
                      <td className="p-2 max-w-[200px] truncate" title={row.description}>{row.description}</td>
                      <td className="p-2">
                        <select
                          className="border border-gray-200 rounded px-1 py-0.5 text-xs max-w-[100px]"
                          value={row.category}
                          onChange={e => updateRow(row.id, { category: e.target.value })}
                        >
                          {categoryOptions(row.type).map(c => (
                            <option key={c} value={c}>{t(c, { defaultValue: c })}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <button
                          type="button"
                          onClick={() => toggleType(row.id)}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${txBadgeClass(row.type)}`}
                        >
                          {txTypeLabel(row.type, t)}
                        </button>
                      </td>
                      <td className="p-2 text-right whitespace-nowrap font-medium">
                        {formatMoney(row.amount, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {t('importRowCount', { count: rows.filter(r => r.checked).length, total: rows.length })}
            </p>
          </div>
        )}

        {step === 3 && !showInterestPrompt && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">{t('importToAccount')}</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
                value={selectedAccountId}
                onChange={e => setSelectedAccountId(e.target.value)}
              >
                <option value="">{t('importSelectAccount')}</option>
                {accounts.some(a => a.accountType === 'bank') && (
                  <optgroup label={t('importBankAccounts')}>
                    {accounts.filter(a => a.accountType === 'bank').map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </optgroup>
                )}
                {accounts.some(a => a.accountType === 'card') && (
                  <optgroup label={t('importCreditCards')}>
                    {accounts.filter(a => a.accountType === 'card').map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            {getSelectedAccount()?.accountType === 'card' && (
              <p className="text-xs text-gray-400">{t('importCardHint')}</p>
            )}
            <p className="text-sm text-gray-500">
              {t('importReadyCount', { count: rows.filter(r => r.checked).length })}
            </p>
          </div>
        )}

        {showInterestPrompt && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
            <p className="text-sm text-amber-900 mb-4">
              {t('importInterestPrompt', {
                amount: formatMoney(interestAmount, currency),
                account: getAccountName(),
              })}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleInterestNo}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-500"
              >
                {t('no')}
              </button>
              <button
                type="button"
                onClick={handleInterestYes}
                className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-medium"
              >
                {t('yes')}
              </button>
            </div>
          </div>
        )}

        {step === 4 && summary && (
          <div className="space-y-6">
            <div className="bg-green-50 border border-green-100 rounded-xl p-4 space-y-1">
              <p className="text-sm text-green-800">
                {t('importDuplicateSummary', {
                  imported: summary.count,
                  skipped: summary.skippedDuplicates || 0,
                })}
              </p>
              {summary.count > 0 && (
                <p className="text-xs text-green-700">
                  {t('importSummary', {
                    count: summary.count,
                    expenses: formatMoney(summary.expenseTotal, currency),
                    income: formatMoney(summary.incomeTotal, currency),
                  })}
                </p>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('importMonthlyEstimate')}</h3>
              <div className="space-y-2">
                {Object.entries(summary.byCategory)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cat, amt]) => (
                    <div key={cat} className="flex justify-between text-sm">
                      <span className="text-gray-600">{t(cat, { defaultValue: cat })}</span>
                      <span className="font-medium">{formatMoney(amt, currency)}</span>
                    </div>
                  ))}
              </div>
              <p className="text-sm font-bold text-purple-600 mt-3">
                {t('importMonthlyTotal')}: {formatMoney(summary.monthlyEstimate, currency)}
              </p>
            </div>

            {summary.recurring.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('importRecurring')}</h3>
                <div className="space-y-2">
                  {summary.recurring.map((r, i) => (
                    <div key={i} className="flex justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                      <span className="text-gray-600 truncate mr-2">🔁 {r.description}</span>
                      <span className="font-medium shrink-0">{formatMoney(r.amount, currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
        {step > 1 && step < 4 && !showInterestPrompt && (
          <button
            type="button"
            onClick={() => setStep(s => s - 1)}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-500"
          >
            {t('back')}
          </button>
        )}
        {step === 2 && (
          <button
            type="button"
            onClick={() => setStep(3)}
            className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-medium"
          >
            {t('next')}
          </button>
        )}
        {step === 3 && !showInterestPrompt && (
          <button
            type="button"
            onClick={runImport}
            disabled={importing}
            className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {importing ? '...' : t('importButton')}
          </button>
        )}
        {step === 4 && (
          <button
            type="button"
            onClick={() => { onComplete?.(); onClose() }}
            className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-medium"
          >
            {t('allDone')}
          </button>
        )}
      </div>
    </div>
  )
}
