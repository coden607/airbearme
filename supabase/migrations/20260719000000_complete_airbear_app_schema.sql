-- Complete the application schema used by server/storage.ts.
-- Safe to run after either the legacy app migration or supabase/schema.sql.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('user', 'driver', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE ride_status AS ENUM ('pending', 'accepted', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('stripe', 'apple_pay', 'google_pay', 'cash');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE maintenance_status AS ENUM ('excellent', 'good', 'needs_service', 'out_of_service');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), email text UNIQUE NOT NULL,
  username text UNIQUE NOT NULL, full_name text, avatar_url text,
  role user_role NOT NULL DEFAULT 'user', stripe_customer_id text,
  stripe_subscription_id text, eco_points integer NOT NULL DEFAULT 0,
  total_rides integer NOT NULL DEFAULT 0, co2_saved numeric(10,2) NOT NULL DEFAULT 0,
  has_ceo_tshirt boolean NOT NULL DEFAULT false, tshirt_purchase_date timestamptz,
  password_hash text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.spots (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), name text NOT NULL,
  latitude numeric(10,8) NOT NULL, longitude numeric(11,8) NOT NULL,
  description text, amenities text[], is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.airbears (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), driver_id uuid REFERENCES public.users(id),
  current_spot_id uuid REFERENCES public.spots(id), battery_level integer NOT NULL DEFAULT 100,
  is_available boolean NOT NULL DEFAULT true, is_charging boolean NOT NULL DEFAULT false,
  total_distance numeric(10,2) NOT NULL DEFAULT 0, maintenance_status text NOT NULL DEFAULT 'good',
  solar_panel_efficiency numeric(5,2) NOT NULL DEFAULT 95, last_maintenance timestamptz DEFAULT now(),
  capacity integer NOT NULL DEFAULT 5, current_riders integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rides (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), user_id uuid NOT NULL REFERENCES public.users(id),
  driver_id uuid REFERENCES public.users(id), airbear_id uuid REFERENCES public.airbears(id),
  pickup_spot_id uuid NOT NULL REFERENCES public.spots(id), destination_spot_id uuid NOT NULL REFERENCES public.spots(id),
  status text NOT NULL DEFAULT 'pending', estimated_duration integer, actual_duration integer,
  distance numeric(8,2), co2_saved numeric(8,2), fare numeric(8,2) NOT NULL DEFAULT 0,
  passengers integer NOT NULL DEFAULT 1, is_free_tshirt_ride boolean NOT NULL DEFAULT false,
  requested_at timestamptz DEFAULT now(), accepted_at timestamptz, started_at timestamptz, completed_at timestamptz,
  current_latitude numeric(10,8), current_longitude numeric(11,8), updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bodega_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), name text NOT NULL, description text,
  price numeric(8,2) NOT NULL DEFAULT 0, image_url text, category text NOT NULL DEFAULT 'other',
  is_eco_friendly boolean NOT NULL DEFAULT false, is_available boolean NOT NULL DEFAULT true,
  is_ceo_special boolean NOT NULL DEFAULT false, stock integer NOT NULL DEFAULT 0, created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), user_id uuid REFERENCES public.users(id),
  ride_id uuid REFERENCES public.rides(id), airbear_id uuid REFERENCES public.airbears(id),
  items jsonb NOT NULL DEFAULT '[]'::jsonb, total_amount numeric(10,2) NOT NULL DEFAULT 0,
  total_cents integer NOT NULL DEFAULT 0, currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'pending', stripe_session_id text, created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), user_id uuid REFERENCES public.users(id),
  order_id uuid REFERENCES public.orders(id), ride_id uuid REFERENCES public.rides(id),
  stripe_payment_intent_id text, amount numeric(10,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd', status text NOT NULL DEFAULT 'pending',
  payment_method text NOT NULL DEFAULT 'stripe', metadata jsonb, created_at timestamptz DEFAULT now()
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE public.airbears ADD COLUMN IF NOT EXISTS capacity integer NOT NULL DEFAULT 5;
ALTER TABLE public.airbears ADD COLUMN IF NOT EXISTS current_riders integer NOT NULL DEFAULT 0;
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS passengers integer NOT NULL DEFAULT 1;
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS current_latitude numeric(10,8);
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS current_longitude numeric(11,8);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ride_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS airbear_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS items jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_amount numeric(10,2) DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_cents integer DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stripe_session_id text;

ALTER TABLE public.spots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.airbears ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bodega_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY airbear_public_spots ON public.spots FOR SELECT TO anon, authenticated USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY airbear_public_fleet ON public.airbears FOR SELECT TO anon, authenticated USING (is_available = true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY airbear_public_bodega ON public.bodega_items FOR SELECT TO anon, authenticated USING (is_available = true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.spots (name, latitude, longitude)
SELECT v.name, v.latitude, v.longitude
FROM (VALUES
  ('Court Street Downtown',42.099118,-75.917538), ('Riverwalk BU Center',42.098765,-75.916543),
  ('Confluence Park',42.090123,-75.912345), ('Southside Walking Bridge',42.091409,-75.914568),
  ('General Hospital',42.086741,-75.915711), ('McArthur Park',42.086165,-75.926153),
  ('Greenway Path',42.086678,-75.932483), ('Vestal Center',42.091851,-75.951729),
  ('Innovation Park',42.093877,-75.958331), ('BU East Gym',42.091695,-75.963590),
  ('BU Fine Arts Building',42.089282,-75.967441), ('Whitney Hall',42.088456,-75.965432),
  ('Student Union',42.086903,-75.966704), ('Appalachian Dining',42.084523,-75.971264),
  ('Hinman Dining Hall',42.086314,-75.973292), ('BU Science Building',42.090227,-75.972315)
) AS v(name, latitude, longitude)
WHERE NOT EXISTS (SELECT 1 FROM public.spots s WHERE s.name = v.name);

INSERT INTO public.bodega_items (name, description, price, category, is_eco_friendly, stock)
SELECT * FROM (VALUES
  ('Cold Brew Coffee','Smooth cold brew coffee',4.50,'beverages',true,25),
  ('Green Smoothie Bowl','Organic spinach, banana, almond milk',8.75,'food',true,15),
  ('Avocado Toast','Sourdough with avocado and microgreens',7.25,'food',true,20),
  ('Sparkling Water','Recyclable glass bottle',2.50,'beverages',true,30),
  ('Trail Mix','Nuts, cranberries, and chocolate',5.25,'snacks',true,35)
) AS v(name, description, price, category, is_eco_friendly, stock)
WHERE NOT EXISTS (SELECT 1 FROM public.bodega_items b WHERE b.name = v.name);

INSERT INTO public.airbears (current_spot_id, battery_level, is_available, is_charging)
SELECT s.id, 90, true, false FROM public.spots s
WHERE s.name = 'Court Street Downtown'
  AND NOT EXISTS (SELECT 1 FROM public.airbears);
