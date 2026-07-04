# Henry Wilhelm Kirenga — Gallery Website & Studio Admin

A premium, static art-portfolio website with a secure, Supabase-backed admin
dashboard. The public site keeps its original luxury design, animations and SEO;
all artwork and page content is now managed from a dashboard — **no code editing
required**.

---

## 1. Architecture at a glance

```
Public site (static HTML/CSS/JS)            Admin dashboard (/admin/)
  index / gallery / about / contact           login → CRUD → CMS
        │                                           │
        └──────────────┬────────────────────────────┘
                       ▼
                assets/data.js  (data-access layer)
                       │
        ┌──────────────┴───────────────┐
        ▼                               ▼
  Supabase (when configured)     assets/seed/*.json  (fallback)
   • Postgres  (artworks, images, collections, site_content, admins)
   • Auth      (email + password)
   • Storage   (public "media" bucket: artworks/ thumbs/ content/)
   • RLS       (public read, admin-only write)
```

**Key idea — progressive enhancement.** The site is plain static files (zero build
step, cannot "break"). A small vanilla-JS layer hydrates content from Supabase when
credentials are present in `assets/config.js`; otherwise it renders from
`assets/seed/*.json`, which mirrors the original hardcoded content exactly. This
means the site works today with no backend, and switches to the live CMS the moment
you paste your keys.

### Files
| Path | Purpose |
|---|---|
| `index/gallery/about/contact.html` | Public pages (design preserved; content bound via `data-cms*` attributes and dynamic grids) |
| `assets/luxury.css` / `luxury.js` | Shared design system + shared behaviour (nav, reveal, modal, popup) |
| `assets/config.js` | Public Supabase URL + anon key (safe to commit). Empty = seed mode |
| `assets/supabase.js` | Lazily loads the Supabase client from CDN |
| `assets/data.js` | Read layer: `getArtworks / getFeatured / getContent / getCollections` with seed fallback |
| `assets/render.js` | Builds the home/gallery grids + hydrates `data-cms` content |
| `assets/image.js` | Client-side compression + thumbnail generation (canvas → WebP) |
| `admin/index.html` + `assets/admin.js` + `admin.css` | The dashboard |
| `assets/seed/*.json` | Snapshot of current artworks + content (fallback + import source) |
| `supabase/migrations/*.sql` | Database schema, RLS policies, storage bucket |
| `scripts/*.mjs` | One-off Node tools: extract seed, create admin, import data |

---

## 2. Setup (make it live)

You only need this to turn on the CMS. Until then the site runs fine in seed mode.

### Prerequisites
- Node 18+ (for the one-time scripts). This repo was built/tested on Node 22.
- A free [Supabase](https://supabase.com) account.

### Steps
1. **Create a Supabase project.** Note, from **Project Settings → API**:
   - Project URL
   - `anon` public key
   - `service_role` secret key (used only by local scripts)

2. **Run the database migrations.** In the Supabase dashboard → **SQL Editor**, run
   these files in order (paste & execute each):
   ```
   supabase/migrations/0001_schema.sql
   supabase/migrations/0002_policies.sql
   supabase/migrations/0003_storage.sql
   ```
   (Or, with the Supabase CLI: `supabase db push`.)

3. **Configure the public client.** Copy `assets/config.example.js` → `assets/config.js`
   and fill in:
   ```js
   export const SUPABASE_URL = "https://YOUR-ref.supabase.co";
   export const SUPABASE_ANON_KEY = "eyJ...";   // anon/public key
   ```
   These are **public** by design — security is enforced by RLS.

4. **Create your admin login + import the current content.**
   ```bash
   cp .env.example .env        # then edit .env with your values
   npm install                 # installs @supabase/supabase-js, sharp, dotenv
   npm run create-admin        # creates your login + adds it to the admins allowlist
   npm run import              # uploads images to Storage + inserts all 60 artworks
   ```

5. **Log in** at `/admin/` with the email/password from `.env`.
   Everything (artworks, images, text, contact info) is now editable there.

> If you skip steps 3–5, the site keeps rendering from the JSON seed. Nothing breaks.

---

## 3. Where data is stored

- **Structured data** → Supabase **Postgres**:
  - `artworks` — one row per piece (title, slug, description, medium, dimensions,
    year, price, availability, categories[], featured, archived, sort_order, …)
  - `artwork_images` — many per artwork (full + thumbnail storage paths, primary flag, order)
  - `collections` — series/groupings
  - `site_content` — key/value store for all editable page text + image references
  - `admins` — allowlist of user IDs permitted to manage content
- **Images** → Supabase **Storage**, public bucket `media`:
  `artworks/<id>/*` (optimized full size), `thumbs/*` (thumbnails), `content/*`
  (profile / portrait / logo).
- **Seed fallback** → `assets/seed/artworks.json` + `content.json` (used when Supabase
  is not configured, and as the import source).

---

## 4. How authentication & security work

- Login uses **Supabase Auth** (email + password) in `/admin/`.
- Being signed in is **not enough**: the app and the database both check the
  `admins` table. A signed-in user who isn't listed there can read/write nothing.
- **Row Level Security (RLS)** is enabled on every table:
  - Public (`anon`) can **read** published rows only (archived artworks are hidden
    even at the API level).
  - **Writes** (`insert/update/delete`) require `is_admin()` — enforced in the
    database, not just the UI.
- **Storage**: anyone can read images (needed to display them); only admins can
  upload/replace/delete.
- The `anon` key in `config.js` is safe to expose. The `service_role` key is secret,
  lives only in `.env`, and is used exclusively by local scripts — it is **never**
  shipped to the browser. `.env` is git-ignored.
- `/admin/` is marked `noindex, nofollow`.

**To add another admin:** set `ADMIN_EMAIL`/`ADMIN_PASSWORD` in `.env` and run
`npm run create-admin` again, or insert a row into `admins` for an existing user.

---

## 5. Image handling

- **On upload (admin):** images are compressed and resized entirely in the browser
  (`assets/image.js`) to a max 1600px optimized WebP **plus** a 480px thumbnail,
  preserving aspect ratio. Both are uploaded to Storage. High-resolution originals
  are supported (downscaled for the web).
- **On the site:** grids use thumbnails; the modal uses the full optimized image.
  All `<img>` use `loading="lazy"`. Cards fade in as images decode.
- **Bulk import:** `scripts/import.mjs` uses `sharp` to generate the same variants
  server-side for the existing 60 works.

---

## 6. Deployment

The site is 100% static — deploy the folder to any static host.

**Netlify / Vercel / Cloudflare Pages / GitHub Pages / Supabase Hosting** all work.

- **Build command:** _none_.
- **Publish directory:** the project root (the folder containing `index.html`).
- Make sure `assets/config.js` contains your real Supabase URL + anon key in the
  deployed copy (commit it, or set it during your deploy step).
- Serve over HTTPS (all the above hosts do). The pages fetch `assets/seed/*.json`
  and ES modules, so they must be served over http(s), **not opened via `file://`**.
- Point your domain (`henrykirenga.co.tz`) at the host and you're live.

Local preview:
```bash
npm run serve        # serves at http://localhost:5173
# or: npx serve .    /    python -m http.server
```

---

## 7. Backups & restore

**Automatic:** Supabase Pro projects include daily backups (Dashboard → Database →
Backups). Free projects: take manual backups on a schedule.

**Manual backup (recommended, portable):**
```bash
# Full database dump (schema + data). Get the connection string from
# Supabase → Project Settings → Database → Connection string.
pg_dump "postgresql://postgres:PASSWORD@db.YOUR-ref.supabase.co:5432/postgres" \
  --no-owner --no-privileges -f backup-$(date +%F).sql

# Storage (images): mirror the media bucket locally with the Supabase CLI
supabase storage cp --recursive ss:///media ./media-backup
```

**Restore:**
```bash
# Database
psql "postgresql://postgres:PASSWORD@db.YOUR-ref.supabase.co:5432/postgres" -f backup-YYYY-MM-DD.sql

# Storage
supabase storage cp --recursive ./media-backup ss:///media
```

> Tip: because `assets/seed/*.json` + the `Image/` folder still exist in the repo,
> you can always re-bootstrap a fresh Supabase project from scratch with
> `npm run import`. That is your disaster-recovery baseline.

---

## 8. Updating dependencies safely

Dependencies are used **only** by the local scripts (`@supabase/supabase-js`,
`sharp`, `dotenv`) — the public site loads Supabase from a pinned CDN URL and has no
runtime npm dependencies.

```bash
npm outdated             # see what's behind
npm update               # apply semver-compatible updates
npm install @supabase/supabase-js@latest   # major bumps: do one at a time
npm run import           # smoke-test the scripts still run
```
To bump the browser client, change the version in `assets/supabase.js`
(`https://esm.sh/@supabase/supabase-js@2`) and test the admin + a public page.

Commit `package-lock.json` so installs are reproducible.

---

## 9. Everything you can manage from `/admin/`

- **Artworks:** add, edit, delete; title, description, medium, dimensions, year,
  price, availability (Available / Reserved / Sold / Unavailable), categories,
  collection; **multiple images** per artwork; set the cover image; replace/remove
  images; **drag-and-drop reordering**; **feature** on the homepage; **archive**
  without deleting.
- **Collections / series:** create, edit, delete.
- **Site content:** artist name, tagline, homepage hero text, homepage statement,
  full About copy, contact email/phone/WhatsApp/location, Instagram, footer text,
  statistics, and the profile & portrait images.

Changes are live immediately on the public site (it reads the same database).

---

## 10. Scaling notes

- The gallery loads via a single indexed query ordered by `sort_order`; indexes exist
  on `sort_order`, `archived`, `featured`, and a GIN index on `categories`. It comfortably
  handles hundreds–thousands of works. If the catalogue grows very large, add pagination
  in `getArtworks()` (the query already supports `.range()`).
- Images are served from Supabase's CDN-backed Storage.
- No rebuild is ever required to add artworks — it's pure data.
```
