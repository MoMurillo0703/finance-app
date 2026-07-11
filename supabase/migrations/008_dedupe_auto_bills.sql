-- Remove duplicate auto credit card bills, keeping the most recent per card
DELETE FROM bills
WHERE is_auto_card_bill = true
  AND id NOT IN (
    SELECT DISTINCT ON (credit_card_id) id
    FROM bills
    WHERE is_auto_card_bill = true
    ORDER BY credit_card_id, created_at DESC
  );

-- Prevent duplicate auto-bills per credit card
CREATE UNIQUE INDEX IF NOT EXISTS bills_one_auto_per_card
  ON bills (credit_card_id)
  WHERE is_auto_card_bill = true AND credit_card_id IS NOT NULL;
