// =============================================
// FinFlow — Supabase Configuration
// =============================================
// INSTRUCTIONS: Replace the values below with your Supabase project credentials.
// Find them at: https://supabase.com/dashboard → Your Project → Settings → API

const SUPABASE_URL = 'YOUR_SUPABASE_URL';       // e.g. https://abcdefghij.supabase.co
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // e.g. eyJhbGciOi...

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
