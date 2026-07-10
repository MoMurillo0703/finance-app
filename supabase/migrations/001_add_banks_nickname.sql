-- Run in Supabase SQL Editor (Dashboard → SQL → New query)
ALTER TABLE banks ADD COLUMN IF NOT EXISTS nickname text;
