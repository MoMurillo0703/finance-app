import { supabase } from './supabase'

export async function adjustBankBalance(bankId, delta) {
  const { data, error: fetchError } = await supabase
    .from('banks')
    .select('balance')
    .eq('id', bankId)
    .single()

  if (fetchError) return fetchError

  const { error: updateError } = await supabase
    .from('banks')
    .update({ balance: (Number(data.balance) || 0) + delta })
    .eq('id', bankId)

  return updateError
}

export async function adjustCardBalance(cardId, delta) {
  const { data, error: fetchError } = await supabase
    .from('credit_cards')
    .select('current_balance')
    .eq('id', cardId)
    .single()

  if (fetchError) return fetchError

  const { error: updateError } = await supabase
    .from('credit_cards')
    .update({ current_balance: Math.max(0, (Number(data.current_balance) || 0) + delta) })
    .eq('id', cardId)

  return updateError
}

export async function adjustVaultBalance(vaultId, delta) {
  const { data, error: fetchError } = await supabase
    .from('vaults')
    .select('current_amount')
    .eq('id', vaultId)
    .single()

  if (fetchError) return fetchError

  const { error: updateError } = await supabase
    .from('vaults')
    .update({ current_amount: Math.max(0, (Number(data.current_amount) || 0) + delta) })
    .eq('id', vaultId)

  return updateError
}

export const bankDelta = (type, amount) => {
  if (type === 'income') return amount
  return -amount // expense and payment reduce bank balance
}

export const cardDelta = (type, amount) => {
  if (type === 'expense') return amount // charge increases amount owed
  return -amount // payment, income/refund reduces amount owed
}
