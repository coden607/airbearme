-- ================================================
-- FINAL FIX - Add Columns FIRST, Then Data
-- ================================================
-- Run this ENTIRE script in Supabase SQL Editor

-- ================================================
-- STEP 1: Add ALL Missing Columns
-- ================================================

-- Fix Users Table
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS eco_points INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_rides INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS co2_saved DECIMAL(10,2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_ceo_tshirt BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tshirt_purchase_date TIMESTAMP;

-- Fix Bodega Items Table - ADD ALL COLUMNS
ALTER TABLE bodega_items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE bodega_items ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE bodega_items ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE bodega_items ADD COLUMN IF NOT EXISTS is_eco_friendly BOOLEAN DEFAULT false;
ALTER TABLE bodega_items ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true;
ALTER TABLE bodega_items ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0;

-- Fix AirBears Table - ADD ALL COLUMNS
ALTER TABLE airbears ADD COLUMN IF NOT EXISTS driver_id VARCHAR;
ALTER TABLE airbears ADD COLUMN IF NOT EXISTS current_spot_id VARCHAR;
ALTER TABLE airbears ADD COLUMN IF NOT EXISTS heading DECIMAL(5,2) DEFAULT 0;
ALTER TABLE airbears ADD COLUMN IF NOT EXISTS battery_level INTEGER DEFAULT 100;
ALTER TABLE airbears ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true;
ALTER TABLE airbears ADD COLUMN IF NOT EXISTS is_charging BOOLEAN DEFAULT false;
ALTER TABLE airbears ADD COLUMN IF NOT EXISTS total_distance DECIMAL(10,2) DEFAULT 0;
ALTER TABLE airbears ADD COLUMN IF NOT EXISTS maintenance_status TEXT DEFAULT 'good';

-- Verify columns were added
SELECT 'Columns Added!' as status;

-- ================================================
-- STEP 2: Disable RLS for Data Insert
-- ================================================
ALTER TABLE bodega_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE airbears DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- ================================================
-- STEP 3: Insert Bodega Items (Now with columns)
-- ================================================
DELETE FROM bodega_items;

INSERT INTO bodega_items (name, description, price, image_url, category, is_eco_friendly, is_available, stock)
VALUES
  ('Cold Brew Coffee', 'Smooth, cold-brewed coffee served over ice', 4.50, 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=400', 'beverages', true, true, 25),
  ('Green Smoothie Bowl', 'Organic spinach, banana, almond milk', 8.75, 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400', 'food', true, true, 15),
  ('Avocado Toast', 'Sourdough with smashed avocado', 7.25, 'https://images.unsplash.com/photo-1541519227354-08fa5d50c44d?w=400', 'food', true, true, 20),
  ('Sparkling Water', 'Naturally carbonated spring water', 2.50, 'https://images.unsplash.com/photo-1559839914-17aae19cec71?w=400', 'beverages', true, true, 30),
  ('Dark Chocolate Bar', '70% cocoa organic dark chocolate', 3.75, 'https://images.unsplash.com/photo-1606312619070-d48b4c652a52?w=400', 'snacks', true, true, 40),
  ('Trail Mix', 'Mixed nuts and dried cranberries', 5.25, 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400', 'snacks', true, true, 35),
  ('Herbal Tea', 'Caffeine-free chamomile tea', 3.25, 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=400', 'beverages', true, true, 22),
  ('Veggie Wrap', 'Whole wheat wrap with hummus', 6.50, 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400', 'food', true, true, 18),
  ('Protein Bar', 'Plant-based protein bar', 4.00, 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400', 'snacks', true, true, 28),
  ('Matcha Latte', 'Ceremonial grade matcha', 5.75, 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=400', 'beverages', true, true, 16),
  ('Water Bottle', 'Stainless steel insulated', 24.99, 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400', 'accessories', true, true, 12),
  ('Bamboo Toothbrush', 'Biodegradable bamboo', 4.99, 'https://images.unsplash.com/photo-1559599101-f09722fb4948?w=400', 'accessories', true, true, 25);

SELECT COUNT(*) as bodega_inserted FROM bodega_items;

-- ================================================
-- STEP 4: Insert AirBears
-- ================================================
DO $$
DECLARE
    spot_rec RECORD;
    current_count INTEGER;
    i INTEGER := 1;
    batteries INTEGER[] := ARRAY[95, 88, 72, 65, 92, 78, 85, 68, 82];
BEGIN
    SELECT COUNT(*) INTO current_count FROM airbears;

    IF current_count < 10 THEN
        FOR spot_rec IN
            SELECT id, latitude, longitude
            FROM spots
            WHERE is_active = true
            ORDER BY name
            LIMIT (10 - current_count)
        LOOP
            INSERT INTO airbears (
                current_spot_id,
                latitude,
                longitude,
                battery_level,
                is_available,
                is_charging,
                heading,
                maintenance_status,
                driver_id,
                total_distance
            ) VALUES (
                spot_rec.id,
                spot_rec.latitude,
                spot_rec.longitude,
                batteries[i],
                CASE WHEN i % 3 = 0 THEN false ELSE true END,
                CASE WHEN i % 4 = 0 THEN true ELSE false END,
                (random() * 360)::INTEGER,
                'good',
                NULL,
                0
            );
            i := i + 1;
        END LOOP;
    END IF;
END $$;

SELECT COUNT(*) as airbears_total FROM airbears;

-- ================================================
-- STEP 5: Re-enable RLS with Policies
-- ================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE bodega_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE airbears ENABLE ROW LEVEL SECURITY;

-- Create policies (ignore errors if exist)
DO $$
BEGIN
    CREATE POLICY "Public read bodega" ON bodega_items FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "Public read airbears" ON airbears FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "Public read users" ON users FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "Public insert users" ON users FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "Public update users" ON users FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

-- ================================================
-- FINAL VERIFICATION
-- ================================================
SELECT
    '🎉 SUCCESS!' as status,
    (SELECT COUNT(*) FROM spots) as spots,
    (SELECT COUNT(*) FROM airbears) as airbears,
    (SELECT COUNT(*) FROM bodega_items) as bodega_items;
