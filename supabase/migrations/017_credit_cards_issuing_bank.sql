-- Optional issuer label shown on cards and account pickers
ALTER TABLE credit_cards
ADD COLUMN IF NOT EXISTS issuing_bank TEXT;
