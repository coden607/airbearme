import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let _supabase: SupabaseClient | null = null;
let _isInitialized = false;

// Initialize supabase client on first access with proper error handling
function initSupabase(): SupabaseClient | null {
  if (_isInitialized) {
    return _supabase;
  }

  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      if (import.meta.env.DEV) {
        console.warn('[Supabase] Missing environment variables - running in demo mode');
      }
      _isInitialized = true;
      return null;
    }

    // Validate that the keys are not placeholder values
    if (supabaseAnonKey.includes('YOUR_SUPABASE_ANON_KEY') || 
        supabaseAnonKey.includes('your_supabase_anon_key') ||
        supabaseUrl.includes('YOUR_SUPABASE_URL') ||
        supabaseUrl.includes('your_supabase_url')) {
      if (import.meta.env.DEV) {
        console.warn('[Supabase] Using placeholder keys - please configure real environment variables');
      }
      _isInitialized = true;
      return null;
    }

    // Validate URL format
    try {
      new URL(supabaseUrl);
    } catch (urlError) {
      if (import.meta.env.DEV) {
        console.error('[Supabase] Invalid URL format:', supabaseUrl);
      }
      _isInitialized = true;
      return null;
    }

    _supabase = createClient(supabaseUrl, supabaseAnonKey);
    _isInitialized = true;
    return _supabase;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[Supabase] Failed to initialize client:', error);
    }
    _isInitialized = true;
    return null;
  }
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
