-- =============================================
-- FinFlow — Migration: Remove auth, simplify tables
-- Run this in Supabase SQL Editor AFTER the original schema
-- =============================================

-- Drop old tables (cascade drops policies too)
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS budgets CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Recreate tables WITHOUT auth dependency
CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  amount decimal NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  date date NOT NULL,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL UNIQUE,
  budget_limit decimal NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE app_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name text DEFAULT 'User',
  currency text DEFAULT 'INR',
  dark_mode boolean DEFAULT true,
  web3forms_key text DEFAULT '',
  alert_email text DEFAULT '',
  budget_alerts boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Disable RLS (no auth needed)
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE budgets DISABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings DISABLE ROW LEVEL SECURITY;

-- Insert default settings row
INSERT INTO app_settings (id, name) VALUES (1, 'User') ON CONFLICT(id) DO NOTHING;

-- Grant access to anon role
GRANT ALL ON transactions TO anon;
GRANT ALL ON budgets TO anon;
GRANT ALL ON app_settings TO anon;
