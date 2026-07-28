-- Atomic bodega checkout: prices and stock come from the database, never the client.
CREATE OR REPLACE FUNCTION public.create_bodega_order(
  p_user_id uuid,
  p_items jsonb,
  p_ride_id uuid DEFAULT NULL,
  p_airbear_id uuid DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  line jsonb;
  item_id uuid;
  quantity integer;
  item_row public.bodega_items%ROWTYPE;
  canonical_items jsonb := '[]'::jsonb;
  total_amount numeric(10,2) := 0;
  created_order public.orders;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one bodega item is required';
  END IF;

  FOR line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    item_id := (COALESCE(line->>'itemId', line->>'item_id'))::uuid;
    quantity := (line->>'quantity')::integer;

    IF quantity IS NULL OR quantity < 1 OR quantity > 50 THEN
      RAISE EXCEPTION 'Invalid quantity for bodega item';
    END IF;

    SELECT * INTO item_row
    FROM public.bodega_items
    WHERE id = item_id
    FOR UPDATE;

    IF NOT FOUND OR NOT item_row.is_available THEN
      RAISE EXCEPTION 'Bodega item is unavailable';
    END IF;

    IF item_row.stock < quantity THEN
      RAISE EXCEPTION 'Insufficient stock for %', item_row.name;
    END IF;

    UPDATE public.bodega_items
    SET stock = stock - quantity,
        is_available = (stock - quantity) > 0
    WHERE id = item_id;

    canonical_items := canonical_items || jsonb_build_array(jsonb_build_object(
      'itemId', item_row.id,
      'name', item_row.name,
      'quantity', quantity,
      'price', item_row.price
    ));
    total_amount := total_amount + (item_row.price * quantity);
  END LOOP;

  INSERT INTO public.orders (
    user_id, ride_id, airbear_id, items, total_amount, total_cents, status
  )
  VALUES (
    p_user_id, p_ride_id, p_airbear_id, canonical_items,
    total_amount, round(total_amount * 100), 'pending'
  )
  RETURNING * INTO created_order;

  RETURN created_order;
END;
$$;

INSERT INTO public.bodega_items (name, description, price, category, is_eco_friendly, is_available, stock)
SELECT v.name, v.description, v.price, v.category, v.is_eco_friendly, true, v.stock
FROM (VALUES
  ('Campus Hydration Water', 'Cold bottled water for class, commuting, and workouts', 1.99, 'beverages', true, 100),
  ('Electrolyte Drink', 'Low-sugar electrolyte drink for long campus days', 2.99, 'beverages', true, 75),
  ('Protein Shake', 'Grab-and-go protein shake for breakfast or post-workout', 5.49, 'beverages', true, 45),
  ('Overnight Oat Cup', 'Portable oat breakfast cup with fruit and whole grains', 3.49, 'food', true, 60),
  ('Greek Yogurt Parfait', 'Greek yogurt with granola and seasonal fruit', 4.99, 'food', true, 40),
  ('Peanut Butter Banana Toast', 'Fast breakfast with protein and whole grains', 5.99, 'food', true, 35),
  ('Fruit Snack Pack', 'Fresh fruit portion for a quick study break', 3.49, 'snacks', true, 50),
  ('Peanut Butter Energy Bar', 'Compact energy bar for between classes', 2.99, 'snacks', true, 100),
  ('Pretzel Snack', 'Portable salty snack in a commuter-friendly pack', 2.49, 'snacks', true, 80),
  ('Mint Gum', 'Fresh breath for class, interviews, and rides', 1.49, 'snacks', true, 120),
  ('Phone Charging Cable', 'Durable USB-C cable for emergency campus charging', 9.99, 'electronics', true, 30),
  ('USB-C Wall Charger', 'Compact fast charger for dorms and study spaces', 16.99, 'electronics', true, 25),
  ('Pocket Power Bank', 'Portable battery for phones during full campus days', 24.99, 'electronics', true, 20),
  ('Hand Sanitizer', 'Pocket-size sanitizer for shared campus spaces', 2.99, 'health', true, 75),
  ('SPF Lip Balm', 'Moisturizing SPF lip balm for outdoor commutes', 3.99, 'health', true, 60),
  ('Reusable Utensil Kit', 'Washable fork, spoon, and chopsticks for campus meals', 7.99, 'accessories', true, 35),
  ('Rain Poncho', 'Compact reusable poncho for sudden campus weather', 6.99, 'accessories', true, 25)
) AS v(name, description, price, category, is_eco_friendly, stock)
WHERE NOT EXISTS (
  SELECT 1 FROM public.bodega_items b WHERE lower(b.name) = lower(v.name)
);

GRANT EXECUTE ON FUNCTION public.create_bodega_order(uuid, jsonb, uuid, uuid) TO service_role;
