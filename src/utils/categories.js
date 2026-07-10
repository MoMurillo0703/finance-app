// Map CSV import categories to values used elsewhere in the app / DB.
export const IMPORT_CATEGORY_MAP = {
  transport: 'essential',
  shopping: 'essential',
  dining: 'food',
  subscriptions: 'bills',
  utilities: 'bills',
  health: 'essential',
  travel: 'travel',
  entertainment: 'fun',
  gas: 'essential',
  insurance: 'bills',
  personal: 'fun',
  auto: 'essential',
  business: 'essential',
  other: 'essential',
}

export function categoryForDb(category) {
  return IMPORT_CATEGORY_MAP[category] || category
}
