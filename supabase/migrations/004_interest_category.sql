-- Run in Supabase SQL Editor
UPDATE transactions SET category = 'interest'
WHERE description ILIKE '%INTEREST CHARGED%' OR description ILIKE '%FINANCE CHARGE%';
