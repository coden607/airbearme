-- Keep the ride metrics trigger aligned with the canonical dropoff_spot_id column.
CREATE OR REPLACE FUNCTION public.calculate_ride_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  pickup_lat decimal;
  pickup_lng decimal;
  dest_lat decimal;
  dest_lng decimal;
  calculated_distance decimal;
  calculated_co2 decimal;
BEGIN
  SELECT latitude, longitude INTO pickup_lat, pickup_lng
  FROM public.spots WHERE id = NEW.pickup_spot_id;

  SELECT latitude, longitude INTO dest_lat, dest_lng
  FROM public.spots WHERE id = NEW.dropoff_spot_id;

  calculated_distance = 6371 * acos(
    cos(radians(pickup_lat)) * cos(radians(dest_lat)) *
    cos(radians(dest_lng) - radians(pickup_lng)) +
    sin(radians(pickup_lat)) * sin(radians(dest_lat))
  );

  calculated_co2 = calculated_distance * 0.21;
  NEW.distance = calculated_distance;
  NEW.co2_saved = calculated_co2;
  NEW.estimated_duration = (calculated_distance / 15) * 60;
  RETURN NEW;
END;
$$;
