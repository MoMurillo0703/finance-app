-- Default payment method for recurring bills
ALTER TABLE bills
ADD COLUMN IF NOT EXISTS default_payment_source TEXT DEFAULT 'bank';

ALTER TABLE bills
DROP CONSTRAINT IF EXISTS bills_default_payment_source_check;

ALTER TABLE bills
ADD CONSTRAINT bills_default_payment_source_check
CHECK (default_payment_source IS NULL OR default_payment_source IN ('bank', 'credit_card', 'manual'));

ALTER TABLE bills
ADD COLUMN IF NOT EXISTS default_bank_id UUID REFERENCES banks(id);

ALTER TABLE bills
ADD COLUMN IF NOT EXISTS default_credit_card_id UUID REFERENCES credit_cards(id);
