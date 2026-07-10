-- Run in Supabase SQL Editor (Dashboard → SQL → New query)
CREATE TABLE IF NOT EXISTS loans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  loan_type text NOT NULL, -- 'auto' | 'mortgage' | 'personal' | 'heloc' | 'student' | 'other'
  lender text,
  original_amount numeric NOT NULL,
  current_balance numeric NOT NULL,
  interest_rate numeric NOT NULL, -- APR as percentage e.g. 6.5
  monthly_payment numeric NOT NULL,
  due_day integer, -- day of month payment is due (1-31)
  start_date date,
  end_date date,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own loans" ON loans
  FOR ALL USING (auth.uid() = user_id);
