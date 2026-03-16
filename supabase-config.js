// =============================================
// FinFlow — Supabase Configuration
// =============================================
// INSTRUCTIONS: Replace the values below with your Supabase project credentials.
// Find them at: https://supabase.com/dashboard → Your Project → Settings → API

const SUPABASE_URL = 'https://rwjgwflqmocmzhtqfvlr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3amd3ZmxxbW9jbXpodHFmdmxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MzU2ODgsImV4cCI6MjA4OTIxMTY4OH0.oIRmfUGv9Tecfo4raOK8xKxql5Lf0hhZczDmcuAKT9I';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
