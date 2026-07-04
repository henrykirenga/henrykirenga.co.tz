// One-time (idempotent) import of the current content + artworks + images into
// Supabase. Reads assets/seed/*.json and Image/* from disk, resizes with sharp,
// uploads to Storage, and inserts rows. Safe to re-run: it upserts by slug/key
// and skips artworks that already have images.
//
// Usage:  node scripts/import.mjs
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}
const BUCKET = "media";
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const artworks = JSON.parse(readFileSync(join(root, "assets/seed/artworks.json"), "utf8"));
const content = JSON.parse(readFileSync(join(root, "assets/seed/content.json"), "utf8"));

async function ensureBucket() {
  const { data } = await sb.storage.getBucket(BUCKET);
  if (!data) await sb.storage.createBucket(BUCKET, { public: true });
}

async function uploadVariants(localPath, baseDir, key) {
  const buf = readFileSync(join(root, localPath));
  const full = await sharp(buf).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  const thumb = await sharp(buf).rotate().resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
  const meta = await sharp(full).metadata();
  const fullPath = `${baseDir}/${key}.webp`;
  const thumbPath = `thumbs/${baseDir}/${key}.webp`;
  let r = await sb.storage.from(BUCKET).upload(fullPath, full, { contentType: "image/webp", upsert: true });
  if (r.error) throw r.error;
  r = await sb.storage.from(BUCKET).upload(thumbPath, thumb, { contentType: "image/webp", upsert: true });
  if (r.error) throw r.error;
  return { storage_path: fullPath, thumb_path: thumbPath, width: meta.width, height: meta.height };
}

async function importContent() {
  const rows = [];
  for (const [key, value] of Object.entries(content)) {
    let v = value;
    if ((key === "profile_image" || key === "artist_portrait") && typeof v === "string" && v.startsWith("Image/")) {
      try {
        const up = await uploadVariants(v, "content", `${key}`);
        v = up.storage_path;
      } catch (e) { console.warn(`  content image ${key} skipped: ${e.message}`); }
    }
    rows.push({ key, value: String(v) });
  }
  const { error } = await sb.from("site_content").upsert(rows, { onConflict: "key" });
  if (error) throw error;
  console.log(`✓ site_content: ${rows.length} keys`);
}

async function importArtworks() {
  let done = 0;
  for (const a of artworks) {
    const payload = {
      legacy_id: a.legacy_id, title: a.title, slug: a.slug, description: a.description,
      medium: a.medium, dimensions: a.dimensions, year: a.year, price_display: a.price_display,
      availability: a.availability, categories: a.categories, featured: a.featured,
      archived: a.archived, sort_order: a.sort_order,
    };
    const { data: row, error } = await sb.from("artworks").upsert(payload, { onConflict: "slug" }).select("id").single();
    if (error) { console.warn(`  ${a.title}: ${error.message}`); continue; }

    const { count } = await sb.from("artwork_images").select("id", { count: "exact", head: true }).eq("artwork_id", row.id);
    if (!count) {
      try {
        const up = await uploadVariants(a.image, `artworks/${row.id}`, "primary");
        await sb.from("artwork_images").insert({
          artwork_id: row.id, storage_path: up.storage_path, thumb_path: up.thumb_path,
          width: up.width, height: up.height, alt: a.title, is_primary: true, sort_order: 0,
        });
      } catch (e) { console.warn(`  image for ${a.title} skipped: ${e.message}`); }
    }
    done++;
    process.stdout.write(`\r  artworks: ${done}/${artworks.length}`);
  }
  console.log(`\n✓ artworks imported`);
}

console.log("Importing into", SUPABASE_URL);
await ensureBucket();
await importContent();
await importArtworks();
console.log("Done. Your site + admin now read from Supabase.");
