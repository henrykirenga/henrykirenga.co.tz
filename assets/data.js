// -----------------------------------------------------------------------------
// Data-access layer for the public site.
// Reads from Supabase when configured; otherwise falls back to assets/seed/*.json
// so the site renders identically with no backend. All functions are async and
// return plain, normalized objects the renderers can consume.
// -----------------------------------------------------------------------------
import { getSupabase } from "./supabase.js";
import { SUPABASE_URL, MEDIA_BUCKET, USE_SUPABASE } from "./config.js";

// ---- image URL resolution -------------------------------------------------
// A stored path can be: an absolute URL, a legacy local file ("Image/x.webp"),
// or a Supabase storage object path -> build a public URL for the last case.
export function mediaUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("Image/") || path.startsWith("./") || path.startsWith("/")) return path;
  if (USE_SUPABASE) {
    return `${SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
  }
  return path;
}

// ---- small fetch cache ----------------------------------------------------
const _cache = new Map();
async function seed(name) {
  if (_cache.has(name)) return _cache.get(name);
  const res = await fetch(`assets/seed/${name}.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`seed ${name} failed: ${res.status}`);
  const data = await res.json();
  _cache.set(name, data);
  return data;
}

// ---- normalization --------------------------------------------------------
function normalizeSeedArtwork(a) {
  return {
    id: a.slug,
    legacy_id: a.legacy_id,
    title: a.title,
    slug: a.slug,
    description: a.description || "",
    medium: a.medium || "",
    dimensions: a.dimensions || "",
    year: a.year || null,
    price_display: a.price_display || "",
    availability: a.availability || "available",
    categories: a.categories || [],
    featured: !!a.featured,
    archived: !!a.archived,
    sort_order: a.sort_order ?? 0,
    images: [{ url: mediaUrl(a.image), thumb: mediaUrl(a.image), alt: a.title }],
    image: mediaUrl(a.image),
    thumb: mediaUrl(a.image),
  };
}

function normalizeDbArtwork(a) {
  const imgs = (a.artwork_images || [])
    .slice()
    .sort((x, y) => (y.is_primary - x.is_primary) || (x.sort_order - y.sort_order))
    .map((im) => ({
      url: mediaUrl(im.storage_path),
      thumb: mediaUrl(im.thumb_path || im.storage_path),
      alt: im.alt || a.title,
    }));
  const primary = imgs[0] || { url: "", thumb: "", alt: a.title };
  return {
    id: a.id,
    legacy_id: a.legacy_id,
    title: a.title,
    slug: a.slug,
    description: a.description || "",
    medium: a.medium || "",
    dimensions: a.dimensions || "",
    year: a.year || null,
    price_display: a.price_display || "",
    availability: a.availability || "available",
    categories: a.categories || [],
    featured: !!a.featured,
    archived: !!a.archived,
    sort_order: a.sort_order ?? 0,
    collection_id: a.collection_id || null,
    images: imgs.length ? imgs : [{ url: "", thumb: "", alt: a.title }],
    image: primary.url,
    thumb: primary.thumb,
  };
}

// ---- public API -----------------------------------------------------------
export async function getArtworks({ category = "all", includeArchived = false } = {}) {
  const sb = await getSupabase();
  let rows;
  if (sb) {
    let q = sb
      .from("artworks")
      .select("*, artwork_images(*)")
      .order("sort_order", { ascending: true });
    if (!includeArchived) q = q.eq("archived", false);
    const { data, error } = await q;
    if (error) throw error;
    rows = data.map(normalizeDbArtwork);
  } else {
    rows = (await seed("artworks"))
      .filter((a) => includeArchived || !a.archived)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map(normalizeSeedArtwork);
  }
  if (category && category !== "all") {
    rows = rows.filter((a) => (a.categories || []).includes(category));
  }
  return rows;
}

export async function getFeatured(limit = 3) {
  const all = await getArtworks();
  const featured = all.filter((a) => a.featured);
  return (featured.length ? featured : all).slice(0, limit);
}

export async function getArtworkBySlug(slug) {
  const all = await getArtworks({ includeArchived: false });
  return all.find((a) => a.slug === slug) || null;
}

export async function getContent() {
  const defaults = await seed("content");
  const sb = await getSupabase();
  if (!sb) return { ...defaults };
  const { data, error } = await sb.from("site_content").select("key,value");
  if (error) return { ...defaults };
  const overrides = Object.fromEntries(data.map((r) => [r.key, r.value]));
  // Resolve image-like keys to full URLs.
  for (const k of ["profile_image", "artist_portrait", "logo_image"]) {
    if (overrides[k]) overrides[k] = mediaUrl(overrides[k]);
  }
  return { ...defaults, ...overrides };
}

export async function getCollections() {
  const sb = await getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("collections")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) return [];
  return data;
}
