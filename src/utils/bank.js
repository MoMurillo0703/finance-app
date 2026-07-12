export const BANK_SELECT = 'id, name, nickname, balance, type, account_type, is_active'
export const BANK_SELECT_FALLBACK = 'id, name, balance, type, is_active'

export const BANK_ACCOUNT_TYPES = [
  { label: '🏦 Checking', value: 'checking' },
  { label: '🐷 Savings', value: 'savings' },
  { label: '📈 Investment', value: 'investment' },
  { label: '💼 Other', value: 'other' },
]

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

export function legacyTypeFromAccountType(accountType) {
  if (accountType === 'investment') return 'money_market'
  if (accountType === 'savings') return 'savings'
  return 'checking'
}

export function getBankAccountType(bank) {
  if (bank?.account_type) return bank.account_type
  if (bank?.type === 'savings') return 'savings'
  if (bank?.type === 'money_market') return 'investment'
  if (bank?.type === 'checking') return 'checking'
  return 'other'
}

export function isCheckingBank(bank) {
  return getBankAccountType(bank) === 'checking'
}

export function accountTypeBadgeStyle(accountType) {
  if (accountType === 'checking') {
    return { backgroundColor: '#EDE9FE', color: '#6D28D9' }
  }
  if (accountType === 'savings') {
    return { backgroundColor: '#DCFCE7', color: '#16A34A' }
  }
  if (accountType === 'investment') {
    return { backgroundColor: '#FEF3C7', color: '#D97706' }
  }
  return { backgroundColor: '#F3F4F6', color: '#6B7280' }
}

export function accountTypeLabel(accountType) {
  if (!accountType) return 'Other'
  return accountType.charAt(0).toUpperCase() + accountType.slice(1)
}

function isMissingColumn(error, column) {
  const message = error?.message || ''
  return message.includes(column) && message.includes('schema')
}

export function isMissingNicknameColumn(error) {
  return isMissingColumn(error, 'nickname')
}

export function isMissingAccountTypeColumn(error) {
  return isMissingColumn(error, 'account_type')
}

export function buildBankInsertRow({
  user_id,
  name,
  nickname,
  accountType = 'checking',
  balance,
  is_active = true,
}) {
  return {
    user_id,
    name,
    nickname: nickname?.trim() || null,
    type: legacyTypeFromAccountType(accountType),
    account_type: accountType,
    balance,
    is_active,
  }
}

export async function insertBank(supabase, row) {
  let payload = { ...row }
  let { data, error } = await supabase.from('banks').insert(payload).select().single()

  if (error && isMissingNicknameColumn(error)) {
    const { nickname: _nickname, ...withoutNickname } = payload
    payload = withoutNickname
    ;({ data, error } = await supabase.from('banks').insert(payload).select().single())
  }

  if (error && isMissingAccountTypeColumn(error)) {
    const { account_type: _accountType, ...withoutAccountType } = payload
    payload = withoutAccountType
    ;({ data, error } = await supabase.from('banks').insert(payload).select().single())
  }

  return { data, error }
}

export async function updateBank(supabase, id, updates) {
  let payload = { ...updates }
  let { data, error } = await supabase.from('banks').update(payload).eq('id', id).select().single()

  if (error && isMissingNicknameColumn(error)) {
    const { nickname: _nickname, ...withoutNickname } = payload
    payload = withoutNickname
    ;({ data, error } = await supabase.from('banks').update(payload).eq('id', id).select().single())
  }

  if (error && isMissingAccountTypeColumn(error)) {
    const { account_type: _accountType, ...withoutAccountType } = payload
    payload = withoutAccountType
    ;({ data, error } = await supabase.from('banks').update(payload).eq('id', id).select().single())
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
  if (result.error && (isMissingNicknameColumn(result.error) || isMissingAccountTypeColumn(result.error))) {
    result = await buildQuery(BANK_SELECT_FALLBACK)
  }
  return result
}
