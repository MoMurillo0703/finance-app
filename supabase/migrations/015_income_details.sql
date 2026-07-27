-- Income details for payday wizard and reports
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS payer TEXT;

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS income_type TEXT;
