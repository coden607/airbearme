import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let _supabase: SupabaseClient | null = null;

// Initialize supabase client on first access
function initSupabase(): SupabaseClient | null {
  if (!_supabase && supabaseUrl && supabaseAnonKey) {
    // Validate that the keys are not placeholder values
    if (supabaseAnonKey.includes('sb_publishable_') || supabaseAnonKey.includes('sb_secret_')) {
      console.warn('Using placeholder Supabase keys - please configure real environment variables');
      return null;
    }
    _supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _supabase;
}

// Export the supabase client (may be null if not configured)
export const supabase = initSupabase();

/**
 * Returns a browser Supabase client. When `requireConfigured` is true, missing
 * env vars throw so we don't silently fall back to demo mode.
 */
export function getSupabaseClient(requireConfigured = false): SupabaseClient | null {
  if (requireConfigured && !supabase) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for live auth.");
  }

  return supabase;
}

export function assertSupabase(): SupabaseClient {
  const client = getSupabaseClient(true);
  if (!client) {
    throw new Error("Supabase client unavailable.");
  }
  return client;
}
