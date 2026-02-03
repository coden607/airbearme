-- ================================================
-- STEP 1: Fix Users Table (Run this FIRST)
-- ================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS eco_points INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_rides INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS co2_saved DECIMAL(10,2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_ceo_tshirt BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tshirt_purchase_date TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Verify: Check if columns were added
SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name IN ('avatar_url', 'full_name');

-- ================================================
-- STEP 2: Fix Bodega Items Table (Run this SECOND)
-- ================================================
ALTER TABLE bodega_items ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true;
ALTER TABLE bodega_items ADD COLUMN IF NOT EXISTS is_eco_friendly BOOLEAN DEFAULT false;
ALTER TABLE bodega_items ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0;
ALTER TABLE bodega_items ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE bodega_items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE bodega_items ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE bodega_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- Verify: Check if columns were added
SELECT column_name FROM information_schema.columns WHERE table_name = 'bodega_items' AND column_name IN ('is_available', 'is_eco_friendly', 'stock');

-- ================================================
-- STEP 3: Disable RLS Temporarily (Run this THIRD)
-- ================================================
ALTER TABLE bodega_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE airbears DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- ================================================
-- STEP 4: Clear and Seed Bodega Items (Run this FOURTH)
-- ================================================
-- Clear existing items
DELETE FROM bodega_items;

-- Insert 12 products
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

-- Verify: Count should be 12
SELECT COUNT(*) as bodega_count FROM bodega_items;

-- ================================================
-- STEP 5: Add AirBear Columns (Run this FIFTH)
-- ================================================
ALTER TABLE airbears ADD COLUMN IF NOT EXISTS driver_id VARCHAR;
ALTER TABLE airbears ADD COLUMN IF NOT EXISTS current_spot_id VARCHAR;
ALTER TABLE airbears ADD COLUMN IF NOT EXISTS heading DECIMAL(5,2) DEFAULT 0;
ALTER TABLE airbears ADD COLUMN IF NOT EXISTS battery_level INTEGER DEFAULT 100;
ALTER TABLE airbears ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true;
ALTER TABLE airbears ADD COLUMN IF NOT EXISTS is_charging BOOLEAN DEFAULT false;
ALTER TABLE airbears ADD COLUMN IF NOT EXISTS total_distance DECIMAL(10,2) DEFAULT 0;
ALTER TABLE airbears ADD COLUMN IF NOT EXISTS maintenance_status TEXT DEFAULT 'good';
ALTER TABLE airbears ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE airbears ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- ================================================
-- STEP 6: Add More AirBears (Run this SIXTH)
-- ================================================
-- Get a valid spot ID first
DO $$
DECLARE
    valid_spot_id VARCHAR;
    spot_ids VARCHAR[];
    i INTEGER;
    battery_vals INTEGER[] := ARRAY[95, 88, 72, 65, 92, 78, 85, 68, 82];
BEGIN
    -- Get array of spot IDs
    SELECT ARRAY_AGG(id) INTO spot_ids FROM spots LIMIT 9;

    -- Insert 9 airbears
    FOR i IN 1..9 LOOP
        valid_spot_id := spot_ids[((i-1) % array_length(spot_ids, 1)) + 1];

        INSERT INTO airbears (
            current_spot_id,
            latitude,
            longitude,
            battery_level,
            is_available,
            is_charging,
            heading,
            maintenance_status
        )
        SELECT
            valid_spot_id,
            s.latitude,
            s.longitude,
            battery_vals[i],
            CASE WHEN i % 3 = 0 THEN false ELSE true END,
            CASE WHEN i % 4 = 0 THEN true ELSE false END,
            (random() * 360)::INTEGER,
            'good'
        FROM spots s
        WHERE s.id = valid_spot_id;
    END LOOP;
END $$;

-- Verify: Count should be 10 (1 existing + 9 new)
SELECT COUNT(*) as airbear_count FROM airbears;

-- ================================================
-- STEP 7: Re-enable RLS with Permissive Policies (Run this SEVENTH)
-- ================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE bodega_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE airbears ENABLE ROW LEVEL SECURITY;
ALTER TABLE spots ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies first
DROP POLICY IF EXISTS "Allow public read access on spots" ON spots;
DROP POLICY IF EXISTS "Allow public read access on airbears" ON airbears;
DROP POLICY IF EXISTS "Allow public read access on bodega_items" ON bodega_items;
DROP POLICY IF EXISTS "Users can insert their own profile" ON users;
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
DROP POLICY IF EXISTS "Users can read all profiles" ON users;

-- Create permissive read policies
CREATE POLICY "Public read spots" ON spots FOR SELECT USING (true);
CREATE POLICY "Public read airbears" ON airbears FOR SELECT USING (true);
CREATE POLICY "Public read bodega" ON bodega_items FOR SELECT USING (true);
CREATE POLICY "Public read users" ON users FOR SELECT USING (true);
CREATE POLICY "Public insert users" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update users" ON users FOR UPDATE USING (true);

-- ================================================
-- STEP 8: Final Verification (Run this LAST)
-- ================================================
SELECT
    'Migration Complete!' as status,
    (SELECT COUNT(*) FROM users) as users,
    (SELECT COUNT(*) FROM spots) as spots,
    (SELECT COUNT(*) FROM airbears) as airbears,
    (SELECT COUNT(*) FROM bodega_items) as bodega_items;
