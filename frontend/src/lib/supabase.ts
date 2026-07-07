/**
 * Supabase browser client (singleton).
 * URL + anon key come from Vite env vars; the anon key is safe to ship because
 * Row Level Security enforces access on the server.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'dev-anon-key';

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const FUNCTIONS_URL =
  import.meta.env.VITE_FUNCTIONS_URL || `${url}/functions/v1`;
