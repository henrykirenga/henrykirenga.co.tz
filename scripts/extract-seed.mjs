// One-off: extract the current hardcoded artworks + categories from gallery.html
// into assets/seed/artworks.json so the public site can render dynamically
// (and so the DB import has a clean source). Run: node scripts/extract-seed.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'gallery.html'), 'utf8');

// 1. Pull the `const artworks = { ... };` object literal and eval it safely.
const start = html.indexOf('const artworks = {');
const objStart = html.indexOf('{', start);
// find matching closing brace
let depth = 0, i = objStart, end = -1;
for (; i < html.length; i++) {
  const c = html[i];
  if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
}
const objText = html.slice(objStart, end + 1);
// eslint-disable-next-line no-eval
const artworks = eval('(' + objText + ')');

// 2. Pull categories from grid cards: <div class="artwork <cats>" data-artwork-id="N">
const catMap = {};
const cardRe = /<div class="artwork([^"]*)"\s+data-artwork-id="(\d+)"/g;
let m;
while ((m = cardRe.exec(html))) {
  const cats = m[1].trim().split(/\s+/).filter(Boolean).map((c) => c.toLowerCase());
  catMap[m[2]] = [...new Set(cats)];
}

const statusNorm = (s) => {
  const v = String(s || '').toLowerCase();
  if (v.includes('sold')) return 'sold';
  if (v.includes('reserved')) return 'reserved';
  if (v.includes('unavailable')) return 'unavailable';
  return 'available';
};

const slugify = (s) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const rows = Object.entries(artworks).map(([id, a], idx) => ({
  legacy_id: Number(id),
  title: a.title.trim(),
  slug: slugify(a.title) || `artwork-${id}`,
  description: (a.description || '').trim(),
  medium: (a.medium || 'Acrylic on Canvas').trim(),
  dimensions: (a.size || '').trim(),
  year: a.year ? Number(String(a.year).replace(/\D/g, '')) || null : null,
  price_display: (a.price || '').trim(),
  availability: statusNorm(a.status),
  categories: catMap[id] || [],
  image: a.image, // local path, e.g. "Image/abstract.webp"
  featured: false,
  archived: false,
  sort_order: idx,
}));

mkdirSync(join(root, 'assets', 'seed'), { recursive: true });
writeFileSync(join(root, 'assets', 'seed', 'artworks.json'), JSON.stringify(rows, null, 2));
console.log(`Wrote ${rows.length} artworks to assets/seed/artworks.json`);
