-- Transfer pairing: account last-four matching + linked transfer sides
ALTER TABLE banks
ADD COLUMN IF NOT EXISTS last_four TEXT;

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS paired_transaction_id UUID REFERENCES transactions(id);

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS transfer_direction TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_transfer_direction_check'
  ) THEN
    ALTER TABLE transactions
    ADD CONSTRAINT transactions_transfer_direction_check
    CHECK (transfer_direction IS NULL OR transfer_direction IN ('out', 'in'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_paired_transaction_id
ON transactions(paired_transaction_id)
WHERE paired_transaction_id IS NOT NULL;
