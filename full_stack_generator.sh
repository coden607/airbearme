#!/usr/bin/env bash
set -euo pipefail

echo "[*] Full-stack generator starting..."

ROOT="$(pwd)"

ensure_dir() {
  mkdir -p "$1"
  echo "[=] Ensured dir: $1"
}

write_if_absent() {
  local path="$1"
  local label="$2"
  if [ -f "$path" ]; then
    echo "[!] Skipping $label (exists at $path)"
  else
    mkdir -p "$(dirname "$path")"
    cat > "$path"
    echo "[+] Created $label → $path"
  fi
}

# -------------------------------------------------------------------
# 1) SUPABASE / POSTGRES SCHEMA + RLS
# -------------------------------------------------------------------

write_if_absent "supabase/schema.sql" "Supabase core schema" << 'SQL'
-- Core users table is usually handled by Supabase auth.users
-- Application-level profiles
create table if not exists public.profiles (
  id uuid primary key default auth.uid(),
  email text not null unique,
  display_name text,
  role text not null default 'user', -- user | driver | admin | vendor
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  name text not null,
  description text,
  price_cents integer not null,
  currency text not null default 'usd',
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_events (
  id bigserial primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  delta integer not null,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create view public.inventory as
select
  p.*,
  coalesce(sum(e.delta), 0) as stock_level
from public.products p
left join public.inventory_events e on e.product_id = p.id
group by p.id;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  status text not null default 'pending', -- pending | paid | cancelled
  total_cents integer not null default 0,
  currency text not null default 'usd',
  stripe_session_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id bigserial primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null,
  unit_price_cents integer not null
);

alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.inventory_events enable row level security;
alter table public.products enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_self'
  ) then
    create policy "profiles_self"
      on public.profiles
      for all
      using (id = auth.uid())
      with check (id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'orders' and policyname = 'orders_owner_or_admin'
  ) then
    create policy "orders_owner_or_admin"
      on public.orders
      for all
      using (user_id = auth.uid() or exists (
        select 1 from public.profiles where id = auth.uid() and role = 'admin'
      ));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'order_items' and policyname = 'order_items_by_order'
  ) then
    create policy "order_items_by_order"
      on public.order_items
      for all
      using (exists (
        select 1
        from public.orders o
        where o.id = order_id and (o.user_id = auth.uid() or exists (
          select 1 from public.profiles where id = auth.uid() and role = 'admin'
        ))
      ));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'products' and policyname = 'products_public_read'
  ) then
    create policy "products_public_read"
      on public.products
      for select
      using (active = true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'inventory_events' and policyname = 'inventory_admin_only'
  ) then
    create policy "inventory_admin_only"
      on public.inventory_events
      for all
      using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
      with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
  end if;
end $$;
SQL

write_if_absent "supabase/README.md" "Supabase usage readme" << 'MD'
# Supabase schema

Apply the schema with:

  supabase db push

Or paste `supabase/schema.sql` into the SQL editor.

Environment variables expected (for both server and client):

- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY (server only)
MD

# -------------------------------------------------------------------
# 2) SERVER: SUPABASE CLIENT + ROUTES
# -------------------------------------------------------------------

ensure_dir "server/routes"

write_if_absent "server/supabaseClient.ts" "Server Supabase client" << 'TS'
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  // Fail fast so we notice in dev
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});
TS

write_if_absent "server/routes/inventory.ts" "Inventory routes" << 'TS'
import { Router } from 'express';
import { supabaseAdmin } from '../supabaseClient';

const router = Router();

router.get('/inventory', async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('inventory').select('*').order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/inventory/adjust', async (req, res) => {
  const { productId, delta, reason } = req.body;
  if (!productId || !delta) return res.status(400).json({ error: 'productId and delta required' });

  const { error } = await supabaseAdmin.from('inventory_events').insert({
    product_id: productId,
    delta,
    reason
  });

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ ok: true });
});

export default router;
TS

write_if_absent "server/routes/orders.ts" "Orders routes" << 'TS'
import { Router } from 'express';
import { supabaseAdmin } from '../supabaseClient';

const router = Router();

// list orders for a user (user id should come from auth middleware in real app)
router.get('/orders/:userId', async (req, res) => {
  const { userId } = req.params;
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('*, order_items(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

export default router;
TS

write_if_absent "server/routes/stripe.ts" "Stripe payment routes" << 'TS'
import { Router } from 'express';
import Stripe from 'stripe';
import { supabaseAdmin } from '../supabaseClient';

const router = Router();

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

router.post('/payments/create-checkout-session', async (req, res) => {
  const { lineItems, successUrl, cancelUrl, userId } = req.body;

  if (!Array.isArray(lineItems) || !successUrl || !cancelUrl || !userId) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { userId }
  });

  res.json({ id: session.id, url: session.url });
});

// NOTE: wire this route as raw body in your main server (express.raw)
// and verify the signature before trusting event.
router.post('/payments/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).send('Missing signature');

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig.toString(), STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error('Webhook signature verification failed', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const total = session.amount_total ?? 0;

    if (userId && session.id) {
      await supabaseAdmin
        .from('orders')
        .update({ status: 'paid', total_cents: total, stripe_session_id: session.id })
        .eq('stripe_session_id', session.id);
    }
  }

  res.json({ received: true });
});

export default router;
TS

# -------------------------------------------------------------------
# 3) FRONTEND FEATURE SKELETONS (REACT)
# -------------------------------------------------------------------

ensure_dir "client/src/features"

write_if_absent "client/src/features/inventory/InventoryPage.tsx" "Inventory page component" << 'TSX'
import React from 'react';
import { useQuery } from '@tanstack/react-query';

type InventoryItem = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  stock_level: number;
  image_url: string | null;
};

async function fetchInventory(): Promise<InventoryItem[]> {
  const res = await fetch('/api/inventory');
  if (!res.ok) throw new Error('Failed to fetch inventory');
  return res.json();
}

export const InventoryPage: React.FC = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['inventory'],
    queryFn: fetchInventory
  });

  if (isLoading) return <div>Loading inventory...</div>;
  if (error) return <div>Error loading inventory.</div>;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">Inventory</h1>
      <div className="grid gap-4 md:grid-cols-3">
        {data?.map(item => (
          <div key={item.id} className="border rounded-lg p-3 flex flex-col gap-2">
            <div className="font-semibold">{item.name}</div>
            {item.image_url && (
              <img src={item.image_url} alt={item.name} className="h-32 w-full object-cover rounded" />
            )}
            <div className="text-sm text-gray-500">{item.description}</div>
            <div className="flex justify-between items-center mt-auto">
              <span className="font-bold">
                {(item.price_cents / 100).toFixed(2)} {item.currency.toUpperCase()}
              </span>
              <span className={item.stock_level > 0 ? 'text-green-600' : 'text-red-600'}>
                {item.stock_level > 0 ? `${item.stock_level} in stock` : 'Out of stock'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
TSX

write_if_absent "client/src/features/cart/CartStore.ts" "Cart store" << 'TS'
import { create } from 'zustand';

type CartItem = {
  productId: string;
  name: string;
  price_cents: number;
  quantity: number;
};

type CartState = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>, qty?: number) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
};

export const useCartStore = create<CartState>((set) => ({
  items: [],
  addItem: (item, qty = 1) =>
    set((state) => {
      const existing = state.items.find((i) => i.productId === item.productId);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.productId === item.productId ? { ...i, quantity: i.quantity + qty } : i
          )
        };
      }
      return { items: [...state.items, { ...item, quantity: qty }] };
    }),
  removeItem: (productId) =>
    set((state) => ({
      items: state.items.filter((i) => i.productId !== productId)
    })),
  clear: () => set({ items: [] })
}));
TS

write_if_absent "client/src/features/checkout/CheckoutButton.tsx" "Checkout button" << 'TSX'
import React from 'react';
import { useCartStore } from '../cart/CartStore';

type Props = {
  successUrl: string;
  cancelUrl: string;
  userId: string;
};

export const CheckoutButton: React.FC<Props> = ({ successUrl, cancelUrl, userId }) => {
  const items = useCartStore((s) => s.items);

  const handleCheckout = async () => {
    if (!items.length) return;

    const lineItems = items.map((i) => ({
      price_data: {
        currency: 'usd',
        product_data: { name: i.name },
        unit_amount: i.price_cents
      },
      quantity: i.quantity
    }));

    const res = await fetch('/api/payments/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineItems, successUrl, cancelUrl, userId })
    });

    if (!res.ok) {
      console.error('Failed to create session');
      return;
    }

    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    }
  };

  return (
    <button
      className="px-4 py-2 rounded bg-black text-white disabled:bg-gray-400"
      disabled={!items.length}
      onClick={handleCheckout}
    >
      Checkout
    </button>
  );
};
TSX

# -------------------------------------------------------------------
# 4) SUMMARY
# -------------------------------------------------------------------

echo "[✓] Full-stack generator finished."
echo "    - Supabase schema: supabase/schema.sql"
echo "    - Server routes: server/routes/{inventory.ts,orders.ts,stripe.ts}"
echo "    - Frontend features: client/src/features/{inventory,cart,checkout}"
echo "Next steps:"
echo "  1) Apply Supabase schema (supabase db push or SQL editor)."
echo "  2) Wire routes into server/index.ts."
echo "  3) Register InventoryPage and CheckoutButton in your router/UI."
