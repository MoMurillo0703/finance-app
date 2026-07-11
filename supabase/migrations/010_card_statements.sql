CREATE TABLE IF NOT EXISTS card_statements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  credit_card_id uuid REFERENCES credit_cards(id) ON DELETE CASCADE NOT NULL,
  statement_date date NOT NULL,
  balance numeric NOT NULL,
  interest_charged numeric DEFAULT 0,
  actual_minimum numeric NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(credit_card_id, statement_date)
);

ALTER TABLE card_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own statements" ON card_statements
  FOR ALL USING (auth.uid() = user_id);
