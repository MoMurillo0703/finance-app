-- Run in Supabase SQL Editor

-- Intro rate fields on credit cards
ALTER TABLE credit_cards
  ADD COLUMN IF NOT EXISTS intro_rate numeric,
  ADD COLUMN IF NOT EXISTS intro_rate_expires date;

-- Intro rate fields on loans
ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS intro_rate numeric,
  ADD COLUMN IF NOT EXISTS intro_rate_expires date;

-- Pay bills with credit card + auto card bills
ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS credit_card_id uuid REFERENCES credit_cards(id),
  ADD COLUMN IF NOT EXISTS is_auto_card_bill boolean DEFAULT false;
