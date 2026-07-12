ALTER TABLE banks
ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'checking'
CHECK (account_type IN ('checking', 'savings', 'investment', 'other'));

UPDATE banks
SET account_type = CASE
  WHEN type = 'savings' THEN 'savings'
  WHEN type = 'money_market' THEN 'investment'
  WHEN type = 'checking' THEN 'checking'
  ELSE 'other'
END
WHERE account_type = 'checking'
  AND type IS NOT NULL
  AND type <> 'checking';

ALTER TABLE vaults
ADD COLUMN IF NOT EXISTS bank_id uuid REFERENCES banks(id);
