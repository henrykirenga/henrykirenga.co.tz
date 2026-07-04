-- =============================================================================
-- 0004_testimonials.sql — visitor-submitted collector testimonials
-- Public can submit and read published ones; admins moderate (hide/delete).
-- (Limited-edition artworks need NO schema change — they use the artworks
--  `categories` array value 'limited-edition', toggled from the admin.)
-- =============================================================================

create table if not exists public.testimonials (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  location   text,
  role_title text,
  quote      text not null,
  approved   boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_testimonials_created on public.testimonials(created_at desc);

alter table public.testimonials enable row level security;

-- Public reads published testimonials; admins see all.
drop policy if exists testimonials_read on public.testimonials;
create policy testimonials_read on public.testimonials
  for select using (approved = true or public.is_admin());

-- Anyone may submit; the row must be created visible (approved = true).
drop policy if exists testimonials_insert on public.testimonials;
create policy testimonials_insert on public.testimonials
  for insert with check (approved = true);

-- Admins can update / delete (moderate).
drop policy if exists testimonials_admin on public.testimonials;
create policy testimonials_admin on public.testimonials
  for all using (public.is_admin()) with check (public.is_admin());
