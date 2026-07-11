-- Run in Supabase SQL Editor

-- Promotional purchases (deferred interest promos per card)
CREATE TABLE IF NOT EXISTS promotional_purchases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  credit_card_id uuid REFERENCES credit_cards(id) ON DELETE CASCADE NOT NULL,
  description text DEFAULT 'Promotional Purchase',
  purchase_date date NOT NULL,
  original_amount numeric NOT NULL,
  remaining_balance numeric NOT NULL,
  expiration_date date NOT NULL,
  deferred_interest numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE promotional_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own promos" ON promotional_purchases
  FOR ALL USING (auth.uid() = user_id);

-- Loan auto-bill link
ALTER TABLE bills ADD COLUMN IF NOT EXISTS loan_id uuid REFERENCES loans(id);
