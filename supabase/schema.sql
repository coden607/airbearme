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
