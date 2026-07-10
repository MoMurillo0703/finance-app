export const BANK_SELECT = 'id, name, nickname, balance, type'
export const BANK_SELECT_FALLBACK = 'id, name, balance, type'

export function getBankDisplayName(bank) {
  if (!bank) return ''
  return bank.nickname?.trim() || bank.name || ''
}

export function getBankDropdownLabel(bank) {
  if (!bank) return ''
  const nickname = bank.nickname?.trim()
  if (nickname) return `${nickname} (${bank.name})`
  return bank.name || ''
}

export function isMissingNicknameColumn(error) {
  const message = error?.message || ''
  return message.includes('nickname') && message.includes('schema')
}

export async function insertBank(supabase, row) {
  let { data, error } = await supabase.from('banks').insert(row).select().single()
  if (error && isMissingNicknameColumn(error)) {
    const { nickname: _nickname, ...withoutNickname } = row
    ;({ data, error } = await supabase.from('banks').insert(withoutNickname).select().single())
  }
  return { data, error }
}

export async function updateBank(supabase, id, updates) {
  let { data, error } = await supabase.from('banks').update(updates).eq('id', id).select().single()
  if (error && isMissingNicknameColumn(error)) {
    const { nickname: _nickname, ...withoutNickname } = updates
    ;({ data, error } = await supabase.from('banks').update(withoutNickname).eq('id', id).select().single())
  }
  return { data, error }
}

export async function fetchBanks(supabase, userId, { orderByName = false } = {}) {
  const buildQuery = (select) => {
    let query = supabase
      .from('banks')
      .select(select)
      .eq('user_id', userId)
      .eq('is_active', true)
    if (orderByName) query = query.order('name')
    return query
  }

  let result = await buildQuery(BANK_SELECT)
  if (result.error && isMissingNicknameColumn(result.error)) {
    result = await buildQuery(BANK_SELECT_FALLBACK)
  }
  return result
}
