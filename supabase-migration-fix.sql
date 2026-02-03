-- ================================================
-- AirBear PWA - Production Database Fix
-- ================================================
-- Run this in Supabase SQL Editor
-- https://supabase.com/dashboard/project/_/sql

-- Fix bodega_items table
-- ================================================

-- Step 1: Add missing is_available column if it doesn't exist
ALTER TABLE bodega_items
ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true;

-- Step 2: Ensure all columns match schema
-- If table exists but has wrong column names, let's check and add missing ones
DO $$
BEGIN
    -- Add is_eco_friendly if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='bodega_items' AND column_name='is_eco_friendly') THEN
        ALTER TABLE bodega_items ADD COLUMN is_eco_friendly BOOLEAN DEFAULT false;
    END IF;

    -- Add stock if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='bodega_items' AND column_name='stock') THEN
        ALTER TABLE bodega_items ADD COLUMN stock INTEGER DEFAULT 0;
    END IF;

    -- Add image_url if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='bodega_items' AND column_name='image_url') THEN
        ALTER TABLE bodega_items ADD COLUMN image_url TEXT;
    END IF;

    -- Add category if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='bodega_items' AND column_name='category') THEN
        ALTER TABLE bodega_items ADD COLUMN category TEXT NOT NULL DEFAULT 'general';
    END IF;
END $$;

-- Step 3: Seed bodega items with complete data
-- ================================================
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
  ('Bamboo Toothbrush', 'Biodegradable bamboo toothbrush with charcoal bristles', 4.99, 'https://images.unsplash.com/photo-1559599101-f09722fb4948?w=400&h=400&fit=crop', 'accessories', true, true, 25)
ON CONFLICT (id) DO NOTHING;

-- Step 4: Add more airbears for better demo
-- ================================================
-- Get spot IDs first (these are examples, adjust to your actual spot IDs)
DO $$
DECLARE
    spot_ids TEXT[] := ARRAY(SELECT id FROM spots ORDER BY name LIMIT 10);
    spot_id TEXT;
    i INTEGER;
BEGIN
    -- Create 9 more airbears (you already have 1, this makes 10 total)
    FOR i IN 1..9 LOOP
        spot_id := spot_ids[(i % array_length(spot_ids, 1)) + 1];

        INSERT INTO airbears (driver_id, current_spot_id, latitude, longitude, battery_level, is_available, is_charging, maintenance_status)
        SELECT
            NULL,
            spot_id,
            (SELECT latitude FROM spots WHERE id = spot_id),
            (SELECT longitude FROM spots WHERE id = spot_id),
            45 + (random() * 50)::INTEGER, -- Random battery 45-95%
            CASE WHEN i % 3 = 0 THEN false ELSE true END, -- Every 3rd is unavailable
            CASE WHEN i % 4 = 0 THEN true ELSE false END, -- Every 4th is charging
            'good';
    END LOOP;
END $$;

-- Verification queries
-- ================================================
SELECT 'Bodega Items:', COUNT(*) FROM bodega_items;
SELECT 'AirBears:', COUNT(*) FROM airbears;
SELECT 'Available AirBears:', COUNT(*) FROM airbears WHERE is_available = true;
SELECT 'Spots:', COUNT(*) FROM spots;
