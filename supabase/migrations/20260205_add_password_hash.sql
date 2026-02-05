-- Add password_hash column to users table for local auth fallback
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
