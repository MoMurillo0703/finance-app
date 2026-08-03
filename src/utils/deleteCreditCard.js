/**
 * Hard-delete a credit card after clearing dependent rows / FK references.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} cardId
 */
export async function deleteCreditCard(supabase, cardId) {
  const { data: cardTxs, error: txFetchError } = await supabase
    .from('transactions')
    .select('id')
    .eq('credit_card_id', cardId)

  if (txFetchError) return { error: txFetchError }

  const cardTxIds = (cardTxs ?? []).map(t => t.id)

  if (cardTxIds.length > 0) {
    // Clear pairs pointing at this card's transactions (column may be missing)
    const { error: pairError } = await supabase
      .from('transactions')
      .update({ paired_transaction_id: null })
      .in('paired_transaction_id', cardTxIds)

    if (pairError && !pairError.message?.includes('paired_transaction_id')) {
      return { error: pairError }
    }
  }

  // Related rows — ignore missing-table errors so older schemas still delete
  const relatedDeletes = [
    supabase.from('card_statements').delete().eq('credit_card_id', cardId),
    supabase.from('promotional_purchases').delete().eq('credit_card_id', cardId),
    supabase.from('bill_payments').delete().eq('credit_card_id', cardId),
    supabase.from('cuotas').delete().eq('credit_card_id', cardId),
  ]

  for (const result of await Promise.all(relatedDeletes)) {
    if (
      result.error
      && result.error.code !== '42P01'
      && !result.error.message?.includes('does not exist')
      && !result.error.message?.includes('credit_card_id')
    ) {
      return { error: result.error }
    }
  }

  const { error: billError } = await supabase
    .from('bills')
    .update({ credit_card_id: null, is_auto_card_bill: false })
    .eq('credit_card_id', cardId)

  if (billError) return { error: billError }

  const { error: txDeleteError } = await supabase
    .from('transactions')
    .delete()
    .eq('credit_card_id', cardId)

  if (txDeleteError) return { error: txDeleteError }

  const { error } = await supabase
    .from('credit_cards')
    .delete()
    .eq('id', cardId)

  return { error: error ?? null }
}
