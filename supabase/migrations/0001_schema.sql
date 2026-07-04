-- =============================================================================
-- 0001_schema.sql — core schema for the Henry Kirenga gallery
-- Run in the Supabase SQL editor (or `supabase db push`) in order.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---- helper: keep updated_at fresh ----------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---- admins allowlist ------------------------------------------------------
-- A user can manage content only if their auth uid is in this table.
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email   text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---- collections / series --------------------------------------------------
create table if not exists public.collections (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  slug        text unique not null,
  description text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_collections_updated before update on public.collections
  for each row execute function public.set_updated_at();

-- ---- artworks --------------------------------------------------------------
create table if not exists public.artworks (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     int,
  title         text not null,
  slug          text unique not null,
  description   text default '',
  medium        text default '',
  dimensions    text default '',
  year          int,
  price         numeric,
  price_display text default '',
  currency      text default 'TZS',
  availability  text not null default 'available'
                check (availability in ('available','reserved','sold','unavailable')),
  categories    text[] not null default '{}',
  collection_id uuid references public.collections(id) on delete set null,
  featured      boolean not null default false,
  archived      boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_artworks_sort      on public.artworks(sort_order);
create index if not exists idx_artworks_archived  on public.artworks(archived);
create index if not exists idx_artworks_featured  on public.artworks(featured);
create index if not exists idx_artworks_categories on public.artworks using gin(categories);
create trigger trg_artworks_updated before update on public.artworks
  for each row execute function public.set_updated_at();

-- ---- artwork images (many per artwork) ------------------------------------
create table if not exists public.artwork_images (
  id           uuid primary key default gen_random_uuid(),
  artwork_id   uuid not null references public.artworks(id) on delete cascade,
  storage_path text not null,               -- optimized full-size object path
  thumb_path   text,                        -- thumbnail object path
  alt          text,
  width        int,
  height       int,
  is_primary   boolean not null default false,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists idx_artwork_images_artwork on public.artwork_images(artwork_id);

-- ---- editable site content (key/value) ------------------------------------
create table if not exists public.site_content (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);
create trigger trg_site_content_updated before update on public.site_content
  for each row execute function public.set_updated_at();
