-- =============================================
-- FinFlow — Supabase Database Schema
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Profiles table (linked to Supabase Auth)
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text not null,
  created_at timestamptz default now()
);

-- 2. Transactions table
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  type text not null check (type in ('income', 'expense')),
  amount decimal not null,
  description text not null,
  category text not null,
  date date not null,
  notes text default '',
  created_at timestamptz default now()
);

-- 3. Budgets table
create table budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  category text not null,
  budget_limit decimal not null,
  created_at timestamptz default now(),
  unique(user_id, category)
);

-- 4. User Settings table
create table user_settings (
  user_id uuid references auth.users on delete cascade primary key,
  currency text default 'INR',
  dark_mode boolean default true,
  notifications boolean default true,
  weekly_report boolean default false,
  web3forms_key text default '',
  alert_email text default '',
  budget_alerts boolean default false,
  created_at timestamptz default now()
);

-- =============================================
-- Row Level Security (RLS) — each user sees only their data
-- =============================================
alter table profiles enable row level security;
alter table transactions enable row level security;
alter table budgets enable row level security;
alter table user_settings enable row level security;

-- Profiles policies
create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- Transactions policies
create policy "Users can view own transactions" on transactions for select using (auth.uid() = user_id);
create policy "Users can insert own transactions" on transactions for insert with check (auth.uid() = user_id);
create policy "Users can delete own transactions" on transactions for delete using (auth.uid() = user_id);

-- Budgets policies
create policy "Users can view own budgets" on budgets for select using (auth.uid() = user_id);
create policy "Users can insert own budgets" on budgets for insert with check (auth.uid() = user_id);
create policy "Users can update own budgets" on budgets for update using (auth.uid() = user_id);
create policy "Users can delete own budgets" on budgets for delete using (auth.uid() = user_id);

-- User Settings policies
create policy "Users can view own settings" on user_settings for select using (auth.uid() = user_id);
create policy "Users can insert own settings" on user_settings for insert with check (auth.uid() = user_id);
create policy "Users can update own settings" on user_settings for update using (auth.uid() = user_id);

-- =============================================
-- Auto-create profile & settings on new user signup
-- =============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', 'User'));
  
  insert into public.user_settings (user_id)
  values (new.id);
  
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
