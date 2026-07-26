-- Harden the canonical schema for production use.
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, extensions;
ALTER FUNCTION public.calculate_ride_metrics() SET search_path = public, extensions;

CREATE INDEX IF NOT EXISTS idx_airbear_inventory_item_id ON public.airbear_inventory(item_id);
CREATE INDEX IF NOT EXISTS idx_airbears_current_spot_id ON public.airbears(current_spot_id);
CREATE INDEX IF NOT EXISTS idx_orders_airbear_id ON public.orders(airbear_id);
CREATE INDEX IF NOT EXISTS idx_orders_ride_id ON public.orders(ride_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_ride_id ON public.payments(ride_id);
CREATE INDEX IF NOT EXISTS idx_rides_airbear_id ON public.rides(airbear_id);
CREATE INDEX IF NOT EXISTS idx_rides_pickup_spot_id ON public.rides(pickup_spot_id);

ALTER TABLE public.airbear_inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read active spots" ON public.spots;
DROP POLICY IF EXISTS "Anyone can read available airbears" ON public.airbears;
DROP POLICY IF EXISTS "Drivers can manage their airbears" ON public.airbears;
DROP POLICY IF EXISTS "Anyone can read available items" ON public.bodega_items;

CREATE POLICY "Drivers can read assigned inventory" ON public.airbear_inventory
FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.airbears a WHERE a.id = airbear_inventory.airbear_id AND a.driver_id = (select auth.uid())));
CREATE POLICY "Drivers can insert their airbears" ON public.airbears
FOR INSERT TO authenticated WITH CHECK (driver_id = (select auth.uid()));
CREATE POLICY "Drivers can update their airbears" ON public.airbears
FOR UPDATE TO authenticated USING (driver_id = (select auth.uid())) WITH CHECK (driver_id = (select auth.uid()));
CREATE POLICY "Drivers can delete their airbears" ON public.airbears
FOR DELETE TO authenticated USING (driver_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can read own data" ON public.users;
DROP POLICY IF EXISTS "Users can update own data" ON public.users;
CREATE POLICY "Users can read own data" ON public.users FOR SELECT TO authenticated USING ((select auth.uid()) = id);
CREATE POLICY "Users can update own data" ON public.users FOR UPDATE TO authenticated USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can read own rides" ON public.rides;
DROP POLICY IF EXISTS "Users can create rides" ON public.rides;
DROP POLICY IF EXISTS "Drivers can update assigned rides" ON public.rides;
CREATE POLICY "Users can read own rides" ON public.rides FOR SELECT TO authenticated USING (user_id = (select auth.uid()) OR driver_id = (select auth.uid()));
CREATE POLICY "Users can create rides" ON public.rides FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Drivers can update assigned rides" ON public.rides FOR UPDATE TO authenticated USING (driver_id = (select auth.uid())) WITH CHECK (driver_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can read own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can create orders" ON public.orders;
CREATE POLICY "Users can read own orders" ON public.orders FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY "Users can create orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can read own payments" ON public.payments;
CREATE POLICY "Users can read own payments" ON public.payments FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
