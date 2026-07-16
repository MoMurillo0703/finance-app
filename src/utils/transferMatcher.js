import { isTransferTransaction } from './transactionType'

export function extractLastFour(description) {
  if (!description) return null
  const masked = description.match(/[*xX]{4,}(\d{4})/)
  if (masked) return masked[1]
  const ending = description.match(/(?:ending in|acct|account)\s*[#:]?\s*(\d{4})\b/i)
  if (ending) return ending[1]
  return null
}

function dayDiffMs(a, b) {
  return Math.abs(new Date(a) - new Date(b))
}

export function autoMatchTransfers(transactions, banks) {
  const result = transactions.map(tx => ({ ...tx }))

  const bankByLastFour = {}
  banks.forEach(b => {
    if (b.last_four) bankByLastFour[String(b.last_four)] = b
  })

  const byId = Object.fromEntries(result.map(tx => [tx.id, tx]))

  result.forEach(tx => {
    if (tx.paired_transaction_id) return
    if (!isTransferTransaction(tx)) return

    const destLastFour = extractLastFour(tx.description)
    const destBank = destLastFour ? bankByLastFour[destLastFour] : null

    const match = result.find(other =>
      other.id !== tx.id
      && !other.paired_transaction_id
      && isTransferTransaction(other)
      && Math.abs(Number(other.amount) - Number(tx.amount)) < 0.01
      && dayDiffMs(other.transaction_date, tx.transaction_date) <= 86400000 * 2
      && (destBank ? other.bank_id === destBank.id : true)
      && (tx.bank_id && other.bank_id ? tx.bank_id !== other.bank_id : true),
    )

    if (!match) return

    const { out, inn } = resolveTransferSides(tx, match)
    out.paired_transaction_id = inn.id
    out.transfer_direction = 'out'
    inn.paired_transaction_id = out.id
    inn.transfer_direction = 'in'
    out.paired_bank = destBank || banks.find(b => b.id === inn.bank_id) || null

    byId[out.id] = out
    byId[inn.id] = inn
  })

  return result
}

export function resolveTransferSides(a, b) {
  if (a.type === 'expense' && b.type !== 'expense') return { out: a, inn: b }
  if (b.type === 'expense' && a.type !== 'expense') return { out: b, inn: a }
  if (a.type === 'income' && b.type !== 'income') return { out: b, inn: a }
  if (b.type === 'income' && a.type !== 'income') return { out: a, inn: b }
  return { out: a, inn: b }
}

export function getPairCandidates(tx, transactions, { days = 3 } = {}) {
  if (!tx) return []
  return transactions.filter(other =>
    other.id !== tx.id
    && isTransferTransaction(other)
    && !other.paired_transaction_id
    && Math.abs(Number(other.amount) - Number(tx.amount)) < 0.01
    && dayDiffMs(other.transaction_date, tx.transaction_date) <= 86400000 * days,
  )
}

export async function learnFromManualPair(txOut, txIn, banks, supabase) {
  const destLastFour = extractLastFour(txOut?.description)
  const sourceLastFour = extractLastFour(txIn?.description)

  if (destLastFour && txIn?.bank_id) {
    const destBank = banks.find(b => b.id === txIn.bank_id)
    if (destBank && !destBank.last_four) {
      await supabase
        .from('banks')
        .update({ last_four: destLastFour })
        .eq('id', txIn.bank_id)
    }
  }

  if (sourceLastFour && txOut?.bank_id) {
    const sourceBank = banks.find(b => b.id === txOut.bank_id)
    if (sourceBank && !sourceBank.last_four) {
      await supabase
        .from('banks')
        .update({ last_four: sourceLastFour })
        .eq('id', txOut.bank_id)
    }
  }
}

export async function pairTransactions(supabase, txA, txB, banks = []) {
  const a = { ...txA }
  const b = { ...txB }
  const { out, inn } = resolveTransferSides(a, b)

  const { error: outError } = await supabase
    .from('transactions')
    .update({
      paired_transaction_id: inn.id,
      transfer_direction: 'out',
    })
    .eq('id', out.id)

  if (outError) return { error: outError }

  const { error: inError } = await supabase
    .from('transactions')
    .update({
      paired_transaction_id: out.id,
      transfer_direction: 'in',
    })
    .eq('id', inn.id)

  if (inError) return { error: inError }

  await learnFromManualPair(out, inn, banks, supabase)
  return { error: null, out, inn }
}

export async function unpairTransfer(supabase, tx) {
  const pairedId = tx?.paired_transaction_id
  const { error: firstError } = await supabase
    .from('transactions')
    .update({ paired_transaction_id: null, transfer_direction: null })
    .eq('id', tx.id)

  if (firstError) return { error: firstError }

  if (pairedId) {
    const { error: secondError } = await supabase
      .from('transactions')
      .update({ paired_transaction_id: null, transfer_direction: null })
      .eq('id', pairedId)
    if (secondError) return { error: secondError }
  }

  return { error: null }
}

export async function saveNewlyMatchedPairs(supabase, matchedTransactions) {
  const written = new Set()
  const ops = []

  for (const tx of matchedTransactions) {
    if (!tx.paired_transaction_id || written.has(tx.id)) continue
    const other = matchedTransactions.find(t => t.id === tx.paired_transaction_id)
    if (!other) continue

    written.add(tx.id)
    written.add(other.id)

    ops.push(
      supabase
        .from('transactions')
        .update({
          paired_transaction_id: other.id,
          transfer_direction: tx.transfer_direction || 'out',
        })
        .eq('id', tx.id),
      supabase
        .from('transactions')
        .update({
          paired_transaction_id: tx.id,
          transfer_direction: other.transfer_direction || 'in',
        })
        .eq('id', other.id),
    )
  }

  if (ops.length === 0) return { error: null, pairedCount: 0 }

  const results = await Promise.all(ops)
  const error = results.find(r => r.error)?.error ?? null
  return { error, pairedCount: written.size / 2 }
}

export async function runAutoMatchForUser(supabase, userId, banks) {
  const { data: transfers, error } = await supabase
    .from('transactions')
    .select('id, amount, description, transaction_date, category, is_transfer, bank_id, type, paired_transaction_id, transfer_direction')
    .eq('user_id', userId)
    .or('is_transfer.eq.true,category.ilike.transfer')

  if (error) {
    // Fallback if is_transfer / or filter fails — fetch recent and filter client-side
    const { data: recent, error: recentError } = await supabase
      .from('transactions')
      .select('id, amount, description, transaction_date, category, is_transfer, bank_id, type, paired_transaction_id, transfer_direction')
      .eq('user_id', userId)
      .order('transaction_date', { ascending: false })
      .limit(500)

    if (recentError) return { error: recentError, pairedCount: 0 }

    const transferOnly = (recent ?? []).filter(isTransferTransaction)
    const matched = autoMatchTransfers(transferOnly, banks ?? [])
    return saveNewlyMatchedPairs(supabase, matched)
  }

  const unmatched = (transfers ?? []).filter(tx => !tx.paired_transaction_id)
  const matched = autoMatchTransfers(unmatched, banks ?? [])
  return saveNewlyMatchedPairs(supabase, matched)
}
