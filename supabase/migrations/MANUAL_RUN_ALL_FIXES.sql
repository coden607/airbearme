-- ============================================
-- AIRBEAR SUPABASE DATABASE FIXES
-- ============================================
-- Run this entire script in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/fushiklvahmujvzuveje/sql/new
--
-- This script:
-- 1. Fixes RLS on users table (security)
-- 2. Cleans up duplicate columns
-- 3. Adds missing indexes
-- 4. Enables realtime
-- ============================================

-- ============================================
-- PART 1: FIX RLS ON USERS TABLE
-- ============================================

-- Ensure RLS is enabled
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Public user profiles" ON users;
DROP POLICY IF EXISTS "Anyone can read users" ON users;
DROP POLICY IF EXISTS "public_users_read" ON users;

-- Recreate proper user access policy (using ::text cast for uuid comparison)
DROP POLICY IF EXISTS "Users can read own data" ON users;
CREATE POLICY "Users can read own data" ON users
  FOR SELECT TO authenticated
  USING (auth.uid()::text = id);

-- Allow users to update their own data
DROP POLICY IF EXISTS "Users can update own data" ON users;
CREATE POLICY "Users can update own data" ON users
  FOR UPDATE TO authenticated
  USING (auth.uid()::text = id);

-- ============================================
-- PART 2: SYNC DATA BEFORE DROPPING COLUMNS
-- ============================================

-- Users table: sync camelCase -> snake_case
UPDATE users SET avatar_url = COALESCE(avatar_url, avatarurl) WHERE avatarurl IS NOT NULL;
UPDATE users SET stripe_customer_id = COALESCE(stripe_customer_id, stripecustomerid) WHERE stripecustomerid IS NOT NULL;
UPDATE users SET stripe_subscription_id = COALESCE(stripe_subscription_id, stripesubscriptionid) WHERE stripesubscriptionid IS NOT NULL;
UPDATE users SET eco_points = COALESCE(NULLIF(eco_points, 0), ecopoints, 0);
UPDATE users SET total_rides = COALESCE(NULLIF(total_rides, 0), totalrides, 0);
UPDATE users SET co2_saved = COALESCE(NULLIF(co2_saved, 0), co2saved, 0);
UPDATE users SET has_ceo_tshirt = COALESCE(has_ceo_tshirt, hasceotshirt, false);
UPDATE users SET tshirt_purchase_date = COALESCE(tshirt_purchase_date, tshirtpurchasedate);

-- Airbears table: sync camelCase -> snake_case
UPDATE airbears SET driver_id = COALESCE(driver_id, driverid);
UPDATE airbears SET current_spot_id = COALESCE(current_spot_id, currentspotid);
UPDATE airbears SET battery_level = COALESCE(battery_level, batterylevel, 100);
UPDATE airbears SET is_available = COALESCE(is_available, isavailable, true);
UPDATE airbears SET is_charging = COALESCE(is_charging, ischarging, false);
UPDATE airbears SET total_distance = COALESCE(total_distance, totaldistance, 0);
UPDATE airbears SET maintenance_status = COALESCE(maintenance_status, maintenancestatus, 'good');

-- ============================================
-- PART 3: DROP DUPLICATE COLUMNS
-- ============================================

-- Users table: drop camelCase duplicates
ALTER TABLE users DROP COLUMN IF EXISTS avatarurl;
ALTER TABLE users DROP COLUMN IF EXISTS stripecustomerid;
ALTER TABLE users DROP COLUMN IF EXISTS stripesubscriptionid;
ALTER TABLE users DROP COLUMN IF EXISTS ecopoints;
ALTER TABLE users DROP COLUMN IF EXISTS totalrides;
ALTER TABLE users DROP COLUMN IF EXISTS co2saved;
ALTER TABLE users DROP COLUMN IF EXISTS hasceotshirt;
ALTER TABLE users DROP COLUMN IF EXISTS tshirtpurchasedate;

-- Airbears table: drop camelCase duplicates
ALTER TABLE airbears DROP COLUMN IF EXISTS driverid;
ALTER TABLE airbears DROP COLUMN IF EXISTS currentspotid;
ALTER TABLE airbears DROP COLUMN IF EXISTS batterylevel;
ALTER TABLE airbears DROP COLUMN IF EXISTS isavailable;
ALTER TABLE airbears DROP COLUMN IF EXISTS ischarging;
ALTER TABLE airbears DROP COLUMN IF EXISTS totaldistance;
ALTER TABLE airbears DROP COLUMN IF EXISTS maintenancestatus;

-- ============================================
-- PART 4: ADD MISSING COLUMNS
-- ============================================

-- Add capacity tracking to airbears
ALTER TABLE airbears ADD COLUMN IF NOT EXISTS capacity integer NOT NULL DEFAULT 5;
ALTER TABLE airbears ADD COLUMN IF NOT EXISTS current_riders integer NOT NULL DEFAULT 0;

-- Add passengers to rides if missing
ALTER TABLE rides ADD COLUMN IF NOT EXISTS passengers integer NOT NULL DEFAULT 1;

-- Add awaiting_payment status to ride_status enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'awaiting_payment' AND enumtypid = 'ride_status'::regtype) THEN
    ALTER TYPE ride_status ADD VALUE 'awaiting_payment' BEFORE 'pending';
  END IF;
EXCEPTION WHEN undefined_object THEN
  -- ride_status enum doesn't exist, try creating it
  NULL;
END $$;

-- ============================================
-- PART 5: CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_airbears_available ON airbears(is_available) WHERE is_available = true;
CREATE INDEX IF NOT EXISTS idx_airbears_driver ON airbears(driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rides_status ON rides(status);
CREATE INDEX IF NOT EXISTS idx_rides_user ON rides(user_id);
CREATE INDEX IF NOT EXISTS idx_rides_driver ON rides(driver_id) WHERE driver_id IS NOT NULL;

-- ============================================
-- PART 6: ENABLE REALTIME
-- ============================================

-- Enable realtime for key tables (ignore errors if already enabled)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE airbears;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE rides;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- DONE!
-- ============================================
SELECT 'All fixes applied successfully!' AS status;
