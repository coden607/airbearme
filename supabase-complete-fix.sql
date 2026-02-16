-- ================================================
-- AirBear PWA - COMPLETE Production Database Fix
-- ================================================
-- Run this ENTIRE script in Supabase SQL Editor
-- https://supabase.com/dashboard/project/_/sql

-- ================================================
-- STEP 1: Fix Users Table Schema
-- ================================================

-- Add avatar_url column if missing (Supabase expects snake_case)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Add password_hash for local auth fallback
ALTER TABLE users
ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Add all other potentially missing columns
ALTER TABLE users
ADD COLUMN IF NOT EXISTS full_name TEXT,
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS eco_points INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_rides INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS co2_saved DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS has_ceo_tshirt BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS tshirt_purchase_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Create index for faster email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ================================================
-- STEP 2: Fix Bodega Items Table
-- ================================================

-- Add all missing columns
ALTER TABLE bodega_items
ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS is_eco_friendly BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general',
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- Clear existing items to avoid conflicts
TRUNCATE TABLE bodega_items CASCADE;

-- Seed 12 eco-friendly bodega items
INSERT INTO bodega_items (name, description, price, image_url, category, is_eco_friendly, is_available, stock)
VALUES
  ('Cold Brew Coffee', 'Smooth, cold-brewed coffee served over ice with a hint of vanilla', 4.50, 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=400&h=400&fit=crop', 'beverages', true, true, 25),
  ('Green Smoothie Bowl', 'Organic spinach, banana, almond milk, topped with granola and berries', 8.75, 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=400&fit=crop', 'food', true, true, 15),
  ('Avocado Toast', 'Sourdough bread with smashed avocado, cherry tomatoes, and microgreens', 7.25, 'https://images.unsplash.com/photo-1541519227354-08fa5d50c44d?w=400&h=400&fit=crop', 'food', true, true, 20),
  ('Sparkling Water', 'Naturally carbonated spring water in recyclable glass bottles', 2.50, 'https://images.unsplash.com/photo-1559839914-17aae19cec71?w=400&h=400&fit=crop', 'beverages', true, true, 30),
  ('Dark Chocolate Bar', '70% cocoa organic dark chocolate with sea salt', 3.75, 'https://images.unsplash.com/photo-1606312619070-d48b4c652a52?w=400&h=400&fit=crop', 'snacks', true, true, 40),
  ('Trail Mix', 'Mixed nuts, dried cranberries, and dark chocolate chips', 5.25, 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=400&fit=crop', 'snacks', true, true, 35),
  ('Herbal Tea', 'Caffeine-free chamomile tea in compostable packaging', 3.25, 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=400&h=400&fit=crop', 'beverages', true, true, 22),
  ('Veggie Wrap', 'Whole wheat wrap with hummus, cucumber, bell peppers, and sprouts', 6.50, 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&h=400&fit=crop', 'food', true, true, 18),
  ('Protein Bar', 'Plant-based protein bar with almonds and dates', 4.00, 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400&h=400&fit=crop', 'snacks', true, true, 28),
  ('Matcha Latte', 'Ceremonial grade matcha with oat milk and honey', 5.75, 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=400&h=400&fit=crop', 'beverages', true, true, 16),
  ('Reusable Water Bottle', 'Stainless steel insulated water bottle - perfect for eco-conscious riders', 24.99, 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400&h=400&fit=crop', 'accessories', true, true, 12),
  ('Bamboo Toothbrush', 'Biodegradable bamboo toothbrush with charcoal bristles', 4.99, 'https://images.unsplash.com/photo-1559599101-f09722fb4948?w=400&h=400&fit=crop', 'accessories', true, true, 25);

-- ================================================
-- STEP 3: Fix AirBears Table
-- ================================================

-- Add missing columns
ALTER TABLE airbears
ADD COLUMN IF NOT EXISTS driver_id VARCHAR REFERENCES users(id),
ADD COLUMN IF NOT EXISTS current_spot_id VARCHAR REFERENCES spots(id),
ADD COLUMN IF NOT EXISTS heading DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS battery_level INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS is_charging BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS total_distance DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS maintenance_status TEXT DEFAULT 'good',
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add 9 more airbears (makes 10 total with your existing 1)
DO $$
DECLARE
    spot_record RECORD;
    counter INTEGER := 0;
    battery_levels INTEGER[] := ARRAY[95, 88, 72, 65, 92, 78, 85, 68, 82];
    available_status BOOLEAN[] := ARRAY[true, true, true, false, true, true, true, false, true];
    charging_status BOOLEAN[] := ARRAY[false, false, false, true, false, false, false, true, false];
BEGIN
    -- Get spots and create airbears
    FOR spot_record IN
        SELECT id, latitude, longitude FROM spots
        WHERE is_active = true
        ORDER BY name
        LIMIT 9
    LOOP
        counter := counter + 1;

        INSERT INTO airbears (
            driver_id,
            current_spot_id,
            latitude,
            longitude,
            heading,
            battery_level,
            is_available,
            is_charging,
            maintenance_status,
            total_distance
        ) VALUES (
            NULL,
            spot_record.id,
            spot_record.latitude + ((random() - 0.5) * 0.001), -- Slight offset for visual variety
            spot_record.longitude + ((random() - 0.5) * 0.001),
            (random() * 360)::INTEGER, -- Random heading
            battery_levels[counter],
            available_status[counter],
            charging_status[counter],
            'good',
            0
        );
    END LOOP;
END $$;

-- ================================================
-- STEP 4: Verification Queries
-- ================================================

SELECT 'Users table columns:' as info, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;

SELECT 'Bodega Items:' as info, COUNT(*) as count FROM bodega_items;
SELECT 'Available Bodega Items:' as info, COUNT(*) as count FROM bodega_items WHERE is_available = true;

SELECT 'AirBears:' as info, COUNT(*) as count FROM airbears;
SELECT 'Available AirBears:' as info, COUNT(*) as count FROM airbears WHERE is_available = true;
SELECT 'Charging AirBears:' as info, COUNT(*) as count FROM airbears WHERE is_charging = true;

SELECT 'Spots:' as info, COUNT(*) as count FROM spots;

-- Show sample data
SELECT 'Sample Bodega Item:' as info, name, price, category FROM bodega_items LIMIT 1;
SELECT 'Sample AirBear:' as info, battery_level, is_available, is_charging FROM airbears LIMIT 1;

-- ================================================
-- STEP 5: Enable Row Level Security (RLS) Policies
-- ================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE spots ENABLE ROW LEVEL SECURITY;
ALTER TABLE airbears ENABLE ROW LEVEL SECURITY;
ALTER TABLE bodega_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- RLS policies already exist from previous run - skip creation
-- If you need to recreate them, DROP the existing policies first

-- ================================================
-- SUCCESS!
-- ================================================
SELECT '✅ Migration Complete!' as status,
       'Bodega Items: ' || (SELECT COUNT(*) FROM bodega_items) || ', ' ||
       'AirBears: ' || (SELECT COUNT(*) FROM airbears) || ', ' ||
       'Spots: ' || (SELECT COUNT(*) FROM spots) as summary;
