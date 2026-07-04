-- =============================================================================
-- 0002_policies.sql — Row Level Security
-- Public (anon) can READ published content only. Only admins can write.
-- =============================================================================

alter table public.artworks       enable row level security;
alter table public.artwork_images enable row level security;
alter table public.collections    enable row level security;
alter table public.site_content   enable row level security;
alter table public.admins         enable row level security;

-- ---- artworks --------------------------------------------------------------
-- Public sees non-archived; admins see everything.
drop policy if exists artworks_read on public.artworks;
create policy artworks_read on public.artworks
  for select using (archived = false or public.is_admin());

drop policy if exists artworks_write on public.artworks;
create policy artworks_write on public.artworks
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- artwork_images --------------------------------------------------------
-- Readable when its artwork is readable; writable by admins.
drop policy if exists artwork_images_read on public.artwork_images;
create policy artwork_images_read on public.artwork_images
  for select using (
    public.is_admin()
    or exists (select 1 from public.artworks a
               where a.id = artwork_id and a.archived = false)
  );

drop policy if exists artwork_images_write on public.artwork_images;
create policy artwork_images_write on public.artwork_images
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- collections -----------------------------------------------------------
drop policy if exists collections_read on public.collections;
create policy collections_read on public.collections for select using (true);

drop policy if exists collections_write on public.collections;
create policy collections_write on public.collections
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- site_content ----------------------------------------------------------
drop policy if exists site_content_read on public.site_content;
create policy site_content_read on public.site_content for select using (true);

drop policy if exists site_content_write on public.site_content;
create policy site_content_write on public.site_content
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- admins ----------------------------------------------------------------
-- A signed-in user may check their own admin row; no client-side writes.
drop policy if exists admins_self on public.admins;
create policy admins_self on public.admins
  for select using (user_id = auth.uid());
