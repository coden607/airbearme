-- Cover catalog entries added by the original seed and make the catalog image-complete.
UPDATE public.bodega_items
SET image_url = CASE
  WHEN lower(name) = 'eco-friendly phone case' THEN 'https://images.unsplash.com/photo-1601593346740-925612772716?w=800&h=800&fit=crop&auto=format'
  WHEN lower(name) = 'solar power bank' THEN 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=800&h=800&fit=crop&auto=format'
  WHEN lower(name) = 'phone charging cable' THEN 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=800&h=800&fit=crop&auto=format'
  WHEN lower(name) LIKE 'ceo-signed airbear t-shirt%' THEN 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&h=800&fit=crop&auto=format'
  ELSE image_url
END
WHERE image_url IS NULL OR image_url = '';
