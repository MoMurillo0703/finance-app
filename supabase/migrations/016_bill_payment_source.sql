-- Bill payment source tracking (bank vs credit card)
CREATE TABLE IF NOT EXISTS bill_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  bill_id UUID REFERENCES bills(id) ON DELETE CASCADE,
  amount_paid NUMERIC NOT NULL,
  paid_date DATE NOT NULL,
  payment_source TEXT DEFAULT 'bank',
  bank_id UUID REFERENCES banks(id),
  credit_card_id UUID REFERENCES credit_cards(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE bill_payments
ADD COLUMN IF NOT EXISTS payment_source TEXT DEFAULT 'bank';

ALTER TABLE bill_payments
ADD COLUMN IF NOT EXISTS credit_card_id UUID REFERENCES credit_cards(id);

ALTER TABLE bill_payments
ADD COLUMN IF NOT EXISTS bank_id UUID REFERENCES banks(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bill_payments_payment_source_check'
  ) THEN
    ALTER TABLE bill_payments
    ADD CONSTRAINT bill_payments_payment_source_check
    CHECK (payment_source IS NULL OR payment_source IN ('bank', 'credit_card', 'manual'));
  END IF;
END $$;

ALTER TABLE bill_payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bill_payments' AND policyname = 'Users manage own bill_payments'
  ) THEN
    CREATE POLICY "Users manage own bill_payments" ON bill_payments
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
