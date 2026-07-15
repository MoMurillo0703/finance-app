-- Plaid-ready transaction schema: source tracking + plaid_transaction_id for dedup
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'
CHECK (source IN ('manual', 'csv_import', 'plaid'));

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS plaid_transaction_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_plaid_transaction_id
ON transactions(plaid_transaction_id)
WHERE plaid_transaction_id IS NOT NULL;
