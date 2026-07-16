export const BANK_SELECT = 'id, name, nickname, balance, type, account_type, is_active, last_four, created_at'
export const BANK_SELECT_FALLBACK = 'id, name, balance, type, is_active, created_at'

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

export function isMissingIsActiveColumn(error) {
  return isMissingColumn(error, 'is_active')
}

export function isMissingLastFourColumn(error) {
  return isMissingColumn(error, 'last_four')
}

export function buildBankInsertRow({
  user_id,
  name,
  nickname,
  accountType = 'checking',
  balance,
  is_active = true,
  last_four = null,
}) {
  return {
    user_id,
    name,
    nickname: nickname?.trim() || null,
    type: legacyTypeFromAccountType(accountType),
    account_type: accountType || 'checking',
    balance: parseFloat(balance) || 0,
    is_active,
    last_four: last_four?.trim() || null,
  }
}

async function insertBankWithPayload(supabase, payload) {
  return supabase.from('banks').insert(payload).select('*').maybeSingle()
}

export async function insertBank(supabase, row) {
  let payload = { ...row }
  let { data, error } = await insertBankWithPayload(supabase, payload)

  if (error && isMissingNicknameColumn(error)) {
    const { nickname: _nickname, ...withoutNickname } = payload
    payload = withoutNickname
    ;({ data, error } = await insertBankWithPayload(supabase, payload))
  }

  if (error && isMissingAccountTypeColumn(error)) {
    const { account_type: _accountType, ...withoutAccountType } = payload
    payload = withoutAccountType
    ;({ data, error } = await insertBankWithPayload(supabase, payload))
  }

  if (error && isMissingIsActiveColumn(error)) {
    const { is_active: _isActive, ...withoutIsActive } = payload
    payload = withoutIsActive
    ;({ data, error } = await insertBankWithPayload(supabase, payload))
  }

  if (error && isMissingLastFourColumn(error)) {
    const { last_four: _lastFour, ...withoutLastFour } = payload
    payload = withoutLastFour
    ;({ data, error } = await insertBankWithPayload(supabase, payload))
  }

  if (!error && !data) {
    const { error: insertError } = await supabase.from('banks').insert(payload)
    if (insertError) return { data: null, error: insertError }

    const { data: fetched, error: fetchError } = await supabase
      .from('banks')
      .select('*')
      .eq('user_id', payload.user_id)
      .eq('name', payload.name)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return { data: fetched, error: fetchError }
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

  if (error && isMissingLastFourColumn(error)) {
    const { last_four: _lastFour, ...withoutLastFour } = payload
    payload = withoutLastFour
    ;({ data, error } = await supabase.from('banks').update(payload).eq('id', id).select().single())
  }

  return { data, error }
}

export async function fetchBanks(supabase, userId, { orderByName = false, orderByCreatedAt = true } = {}) {
  const applyOrdering = (query) => {
    if (orderByName) return query.order('name')
    if (orderByCreatedAt) return query.order('created_at', { ascending: false })
    return query
  }

  const buildQuery = (select, { filterActive = true } = {}) => {
    let query = supabase
      .from('banks')
      .select(select)
      .eq('user_id', userId)
    if (filterActive) query = query.eq('is_active', true)
    return applyOrdering(query)
  }

  let result = await buildQuery(BANK_SELECT)
  if (result.error && isMissingIsActiveColumn(result.error)) {
    result = await buildQuery(BANK_SELECT, { filterActive: false })
  }
  if (result.error && (isMissingNicknameColumn(result.error) || isMissingAccountTypeColumn(result.error) || isMissingLastFourColumn(result.error))) {
    const selectWithoutLastFour = BANK_SELECT.replace(', last_four', '')
    result = await buildQuery(
      isMissingNicknameColumn(result.error) || isMissingAccountTypeColumn(result.error)
        ? BANK_SELECT_FALLBACK
        : selectWithoutLastFour,
    )
    if (result.error && isMissingIsActiveColumn(result.error)) {
      result = await buildQuery(
        isMissingNicknameColumn(result.error) || isMissingAccountTypeColumn(result.error)
          ? BANK_SELECT_FALLBACK
          : selectWithoutLastFour,
        { filterActive: false },
      )
    }
  }
  if (result.error && isMissingColumn(result.error, 'created_at')) {
    const buildWithoutCreatedAt = (select, { filterActive = true } = {}) => {
      let query = supabase
        .from('banks')
        .select(select.replace(', created_at', '').replace('created_at, ', ''))
        .eq('user_id', userId)
      if (filterActive) query = query.eq('is_active', true)
      if (orderByName) query = query.order('name')
      return query
    }
    result = await buildWithoutCreatedAt(BANK_SELECT)
    if (result.error && isMissingIsActiveColumn(result.error)) {
      result = await buildWithoutCreatedAt(BANK_SELECT, { filterActive: false })
    }
  }
  return result
}
