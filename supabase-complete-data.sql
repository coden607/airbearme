-- ================================================
-- Complete the Data Insert (No Policies)
-- ================================================
-- This adds the remaining bodega items and airbears
-- Run this entire script in Supabase SQL Editor

-- First, disable RLS to allow inserts
ALTER TABLE bodega_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE airbears DISABLE ROW LEVEL SECURITY;

-- ================================================
-- Add Remaining Bodega Items
-- ================================================
-- Clear ALL and re-insert all 12
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
  ('Water Bottle', 'Stainless steel insulated bottle', 24.99, 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400', 'accessories', true, true, 12),
  ('Bamboo Toothbrush', 'Biodegradable bamboo toothbrush', 4.99, 'https://images.unsplash.com/photo-1559599101-f09722fb4948?w=400', 'accessories', true, true, 25);

-- Check count
SELECT COUNT(*) as bodega_items_count FROM bodega_items;

-- ================================================
-- Add 9 More AirBears (Total 10)
-- ================================================
DO $$
DECLARE
    spot_rec RECORD;
    spot_count INTEGER;
    i INTEGER := 1;
    battery_vals INTEGER[] := ARRAY[95, 88, 72, 65, 92, 78, 85, 68, 82];
BEGIN
    -- Get count of existing airbears
    SELECT COUNT(*) INTO spot_count FROM airbears;

    -- Only add if we have less than 10
    IF spot_count < 10 THEN
        -- Get spots
        FOR spot_rec IN
            SELECT id, latitude, longitude
            FROM spots
            WHERE is_active = true
            ORDER BY name
            LIMIT 9
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
                spot_rec.latitude + ((random() - 0.5) * 0.001),
                spot_rec.longitude + ((random() - 0.5) * 0.001),
                battery_vals[i],
                CASE WHEN i % 3 = 0 THEN false ELSE true END,
                CASE WHEN i % 4 = 0 THEN true ELSE false END,
                (random() * 360)::INTEGER,
                'good',
                NULL,
                0
            );

            i := i + 1;
            EXIT WHEN i > 9;
        END LOOP;
    END IF;
END $$;

-- Check count
SELECT COUNT(*) as airbears_count FROM airbears;

-- ================================================
-- Re-enable RLS with public read access
-- ================================================
ALTER TABLE bodega_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE airbears ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies (ignore errors if they don't exist)
DO $$
BEGIN
    DROP POLICY IF EXISTS "Public read bodega" ON bodega_items;
    DROP POLICY IF EXISTS "Public read airbears" ON airbears;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Create new policies
CREATE POLICY "Public read bodega" ON bodega_items FOR SELECT USING (true);
CREATE POLICY "Public read airbears" ON airbears FOR SELECT USING (true);

-- ================================================
-- Final Verification
-- ================================================
SELECT
    '✅ COMPLETE!' as status,
    (SELECT COUNT(*) FROM spots) as spots,
    (SELECT COUNT(*) FROM airbears) as airbears,
    (SELECT COUNT(*) FROM bodega_items) as bodega_items;
