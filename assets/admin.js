// =============================================================================
// Studio Admin — secure content management for the gallery.
// Vanilla ES module. Auth + data via Supabase; images compressed client-side.
// Access is gated by the `admins` table + RLS: a signed-in user who is not in
// `admins` can read/write nothing.
// =============================================================================
import { getSupabase } from "./supabase.js";
import { processImage, randomId } from "./image.js";
import { MEDIA_BUCKET, SUPABASE_URL, USE_SUPABASE } from "./config.js";

const CATEGORIES = ["portraits", "nature", "wildlife", "abstract", "culture", "commissions"];
const AVAILABILITY = ["available", "reserved", "sold", "unavailable"];
const CONTENT_FIELDS = [
  { group: "Identity" },
  { key: "artist_name", label: "Artist name", type: "text" },
  { key: "tagline", label: "Tagline", type: "text" },
  { group: "Homepage hero" },
  { key: "home_hero_eyebrow", label: "Hero eyebrow", type: "text" },
  { key: "home_hero_title_html", label: "Hero title (HTML allowed)", type: "area" },
  { key: "home_hero_text", label: "Hero text", type: "area" },
  { group: "Homepage statement" },
  { key: "home_statement_title", label: "Statement title", type: "text" },
  { key: "home_statement_p1", label: "Statement paragraph 1", type: "area" },
  { key: "home_statement_p2", label: "Statement paragraph 2", type: "area" },
  { group: "About page" },
  { key: "about_hero_text", label: "About hero text", type: "area" },
  { key: "about_vision_title", label: "Vision title", type: "text" },
  { key: "about_vision_p1", label: "Vision paragraph 1", type: "area" },
  { key: "about_vision_p2", label: "Vision paragraph 2", type: "area" },
  { key: "about_philosophy", label: "Philosophy", type: "area" },
  { group: "Limited edition section" },
  { key: "limited_title", label: "Limited edition heading", type: "text" },
  { key: "limited_intro", label: "Limited edition intro", type: "area" },
  { group: "Contact & footer" },
  { key: "email", label: "Email", type: "text" },
  { key: "phone", label: "Phone", type: "text" },
  { key: "whatsapp", label: "WhatsApp number (digits only)", type: "text" },
  { key: "location", label: "Studio location", type: "text" },
  { key: "instagram_url", label: "Instagram URL", type: "text" },
  { key: "instagram_handle", label: "Instagram handle", type: "text" },
  { key: "footer_about", label: "Footer about text", type: "area" },
  { group: "Statistics" },
  { key: "stat_years", label: "Years painting", type: "text" },
  { key: "stat_exhibitions", label: "Exhibitions", type: "text" },
  { key: "stat_continents", label: "Continents collected", type: "text" },
  { key: "stat_original", label: "Original work", type: "text" },
  { group: "Images" },
  { key: "profile_image", label: "Profile picture", type: "image" },
  { key: "artist_portrait", label: "Artist portrait (about hero)", type: "image" },
];

const $ = (s, r = document) => r.querySelector(s);
const app = () => document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const mediaUrl = (p) => (!p ? "" : /^https?:\/\//.test(p) ? p : `${SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/${p}`);

let sb = null;
let session = null;
let state = { view: "artworks", artworks: [], collections: [] };

function toast(msg, isErr = false) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast show" + (isErr ? " err" : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.className = "toast"), 3200);
}

// ---------------------------------------------------------------------------
// Boot & auth
// ---------------------------------------------------------------------------
async function boot() {
  if (!USE_SUPABASE) return showSetup();
  sb = await getSupabase();
  const { data } = await sb.auth.getSession();
  if (data.session && (await isAdmin(data.session.user.id))) {
    session = data.session;
    await loadAll();
    renderShell();
  } else {
    if (data.session) await sb.auth.signOut();
    showLogin();
  }
}

async function isAdmin(uid) {
  const { data } = await sb.from("admins").select("user_id").eq("user_id", uid).maybeSingle();
  return !!data;
}

function showSetup() {
  app().innerHTML = `<div class="auth-wrap"><div class="auth-card">
    <div class="brand">Henry <span>Kirenga</span></div>
    <div class="sub">Studio Admin</div>
    <p style="color:#c7c6cd;line-height:1.7">Supabase isn't configured yet. Add your project URL and anon key to
    <code style="color:var(--gold-soft)">assets/config.js</code>, then reload. See <b>README.md → Setup</b>.</p>
  </div></div>`;
}

function showLogin() {
  app().innerHTML = `<div class="auth-wrap"><div class="auth-card">
    <div class="brand">Henry <span>Kirenga</span></div>
    <div class="sub">Studio Admin</div>
    <form id="login">
      <div class="fld"><label>Email</label><input type="email" name="email" required autocomplete="username"></div>
      <div class="fld"><label>Password</label><input type="password" name="password" required autocomplete="current-password"></div>
      <button class="abtn abtn-gold" style="width:100%;justify-content:center" type="submit">Sign in</button>
      <div class="err" id="login-err"></div>
    </form>
  </div></div>`;
  $("#login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    btn.disabled = true; btn.textContent = "Signing in…";
    const f = new FormData(e.target);
    const { data, error } = await sb.auth.signInWithPassword({ email: f.get("email"), password: f.get("password") });
    if (error) { $("#login-err").textContent = error.message; btn.disabled = false; btn.textContent = "Sign in"; return; }
    if (!(await isAdmin(data.user.id))) {
      await sb.auth.signOut();
      $("#login-err").textContent = "This account is not authorized for the admin.";
      btn.disabled = false; btn.textContent = "Sign in"; return;
    }
    session = data.session;
    await loadAll();
    renderShell();
  });
}

async function loadAll() {
  const [{ data: aw }, { data: col }] = await Promise.all([
    sb.from("artworks").select("*, artwork_images(*)").order("sort_order", { ascending: true }),
    sb.from("collections").select("*").order("sort_order", { ascending: true }),
  ]);
  state.artworks = aw || [];
  state.collections = col || [];
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------
function renderShell() {
  app().innerHTML = `
    <div class="admin-shell">
      <aside class="sidebar">
        <div class="brand">Henry <span>Kirenga</span></div>
        <button class="nav-item" data-view="artworks">🎨 Artworks</button>
        <button class="nav-item" data-view="collections">🗂️ Collections</button>
        <button class="nav-item" data-view="content">📝 Site Content</button>
        <button class="nav-item" data-view="testimonials">💬 Testimonials</button>
        <div class="spacer"></div>
        <div class="who">${esc(session.user.email)}</div>
        <button class="nav-item" id="signout">↩ Sign out</button>
      </aside>
      <main class="main" id="view"></main>
    </div>`;
  app().querySelectorAll(".nav-item[data-view]").forEach((b) =>
    b.addEventListener("click", () => { state.view = b.dataset.view; paintNav(); renderView(); })
  );
  $("#signout").addEventListener("click", async () => { await sb.auth.signOut(); location.reload(); });
  paintNav();
  renderView();
}

function paintNav() {
  app().querySelectorAll(".nav-item[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
}

function renderView() {
  if (state.view === "artworks") return renderArtworks();
  if (state.view === "collections") return renderCollections();
  if (state.view === "content") return renderContent();
  if (state.view === "testimonials") return renderTestimonialsView();
}

// ---------------------------------------------------------------------------
// Testimonials moderation
// ---------------------------------------------------------------------------
async function renderTestimonialsView() {
  $("#view").innerHTML = `<div class="page-head"><div><h1>Testimonials</h1><div class="muted">Visitor submissions — shown live on the About page</div></div></div><div class="spin"></div>`;
  const { data, error } = await sb.from("testimonials").select("*").order("created_at", { ascending: false });
  if (error) {
    $("#view").innerHTML = `<div class="page-head"><div><h1>Testimonials</h1></div></div>
      <div class="empty">The <code>testimonials</code> table isn't set up yet.<br>Run <b>supabase/migrations/0004</b> in the Supabase SQL editor, then reload.</div>`;
    return;
  }
  $("#view").innerHTML = `
    <div class="page-head"><div><h1>Testimonials</h1><div class="muted">${data.length} submitted · ${data.filter((t) => t.approved).length} live</div></div></div>
    <div class="aw-list">${data.length ? data.map((t) => `
      <div class="aw-row" style="grid-template-columns:1fr auto" data-id="${t.id}">
        <div class="aw-meta">
          <div class="t">${esc(t.name)}${t.role_title ? " · " + esc(t.role_title) : ""}${t.location ? " · " + esc(t.location) : ""}</div>
          <div class="s" style="color:#c7c6cd;max-width:640px">${esc(t.quote)}</div>
          <div class="s">${t.approved ? '<span class="badge available">Live</span>' : '<span class="badge arch">Hidden</span>'}</div>
        </div>
        <div class="aw-actions">
          <button class="abtn abtn-ghost" data-a="toggle">${t.approved ? "Hide" : "Publish"}</button>
          <button class="icon-btn abtn-danger" data-a="del">🗑</button>
        </div>
      </div>`).join("") : `<div class="empty">No testimonials yet.</div>`}</div>`;
  $("#view").querySelectorAll(".aw-row").forEach((row) => {
    const t = data.find((x) => x.id === row.dataset.id);
    row.querySelector('[data-a="toggle"]').addEventListener("click", async () => {
      const { error: e } = await sb.from("testimonials").update({ approved: !t.approved }).eq("id", t.id);
      if (e) return toast(e.message, true);
      toast(t.approved ? "Hidden" : "Published"); renderTestimonialsView();
    });
    row.querySelector('[data-a="del"]').addEventListener("click", async () => {
      if (!confirm("Delete this testimonial?")) return;
      const { error: e } = await sb.from("testimonials").delete().eq("id", t.id);
      if (e) return toast(e.message, true);
      toast("Deleted"); renderTestimonialsView();
    });
  });
}

// ---------------------------------------------------------------------------
// Artworks list (+ drag reorder)
// ---------------------------------------------------------------------------
function renderArtworks() {
  const rows = state.artworks;
  $("#view").innerHTML = `
    <div class="page-head">
      <div><h1>Artworks</h1><div class="muted">${rows.length} pieces · drag to reorder</div></div>
      <button class="abtn abtn-gold" id="add-aw">＋ Add artwork</button>
    </div>
    <div class="aw-list" id="aw-list">
      ${rows.length ? rows.map(rowHtml).join("") : `<div class="empty">No artworks yet. Click “Add artwork”.</div>`}
    </div>`;
  $("#add-aw").addEventListener("click", addArtwork);
  wireArtworkRows();
}

function primaryThumb(a) {
  const imgs = (a.artwork_images || []).slice().sort((x, y) => (y.is_primary - x.is_primary) || (x.sort_order - y.sort_order));
  const p = imgs[0];
  return p ? mediaUrl(p.thumb_path || p.storage_path) : "";
}

function rowHtml(a) {
  const thumb = primaryThumb(a);
  return `<div class="aw-row" draggable="true" data-id="${a.id}">
    <div class="aw-handle" title="Drag">⋮⋮</div>
    <img class="aw-thumb" src="${esc(thumb)}" alt="" onerror="this.style.opacity=.2">
    <div class="aw-meta">
      <div class="t">${esc(a.title)}</div>
      <div class="s">
        <span class="badge ${a.availability}">${esc(a.availability)}</span>
        ${a.featured ? '<span class="badge feat">Featured</span>' : ""}
        ${a.archived ? '<span class="badge arch">Archived</span>' : ""}
        <span>${esc(a.dimensions || "")}</span>
        <span>${a.year || ""}</span>
      </div>
    </div>
    <div class="aw-actions">
      <button class="icon-btn" data-act="feature" title="Toggle featured">★</button>
      <button class="icon-btn" data-act="archive" title="Toggle archived">🗄</button>
      <button class="abtn abtn-ghost" data-act="edit">Edit</button>
      <button class="icon-btn abtn-danger" data-act="delete" title="Delete">🗑</button>
    </div>
  </div>`;
}

function wireArtworkRows() {
  const list = $("#aw-list");
  list.querySelectorAll(".aw-row").forEach((row) => {
    const a = state.artworks.find((x) => x.id === row.dataset.id);
    row.querySelector('[data-act="edit"]').addEventListener("click", () => openEditor(a));
    row.querySelector('[data-act="delete"]').addEventListener("click", () => deleteArtwork(a));
    row.querySelector('[data-act="feature"]').addEventListener("click", () => toggleField(a, "featured"));
    row.querySelector('[data-act="archive"]').addEventListener("click", () => toggleField(a, "archived"));
    row.addEventListener("dragstart", () => { row.classList.add("dragging"); });
    row.addEventListener("dragend", () => { row.classList.remove("dragging"); persistOrder(); });
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      const dragging = list.querySelector(".dragging");
      if (!dragging || dragging === row) return;
      const rect = row.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      list.insertBefore(dragging, after ? row.nextSibling : row);
    });
  });
}

async function persistOrder() {
  const ids = [...$("#aw-list").querySelectorAll(".aw-row")].map((r) => r.dataset.id);
  const changed = [];
  ids.forEach((id, i) => {
    const a = state.artworks.find((x) => x.id === id);
    if (a && a.sort_order !== i) { a.sort_order = i; changed.push({ id, i }); }
  });
  if (!changed.length) return;
  state.artworks.sort((x, y) => x.sort_order - y.sort_order);
  try {
    await Promise.all(changed.map((c) => sb.from("artworks").update({ sort_order: c.i }).eq("id", c.id)));
    toast("Order saved");
  } catch (e) { toast("Could not save order", true); }
}

async function toggleField(a, field) {
  const { error } = await sb.from("artworks").update({ [field]: !a[field] }).eq("id", a.id);
  if (error) return toast(error.message, true);
  a[field] = !a[field];
  renderArtworks();
  toast(`${field} ${a[field] ? "on" : "off"}`);
}

async function addArtwork() {
  const id = randomId();
  const draft = {
    id, title: "Untitled", slug: `artwork-${id.slice(0, 8)}`, description: "", medium: "Acrylic on Canvas",
    dimensions: "", year: new Date().getFullYear(), price_display: "", availability: "available",
    categories: [], collection_id: null, featured: false, archived: true, sort_order: state.artworks.length,
  };
  const { data, error } = await sb.from("artworks").insert(draft).select("*, artwork_images(*)").single();
  if (error) return toast(error.message, true);
  state.artworks.push(data);
  openEditor(data);
}

async function deleteArtwork(a) {
  if (!confirm(`Delete “${a.title}”? This also removes its images.`)) return;
  // remove storage objects first
  const paths = (a.artwork_images || []).flatMap((im) => [im.storage_path, im.thumb_path].filter(Boolean));
  if (paths.length) await sb.storage.from(MEDIA_BUCKET).remove(paths);
  const { error } = await sb.from("artworks").delete().eq("id", a.id);
  if (error) return toast(error.message, true);
  state.artworks = state.artworks.filter((x) => x.id !== a.id);
  renderArtworks();
  toast("Artwork deleted");
}

// ---------------------------------------------------------------------------
// Artwork editor (drawer)
// ---------------------------------------------------------------------------
function openEditor(a) {
  const collOpts = ['<option value="">— none —</option>']
    .concat(state.collections.map((c) => `<option value="${c.id}" ${a.collection_id === c.id ? "selected" : ""}>${esc(c.title)}</option>`))
    .join("");
  const drawer = document.createElement("div");
  drawer.innerHTML = `
    <div class="drawer-back" id="db"></div>
    <div class="drawer" id="dr">
      <div class="drawer-head"><h2>Edit artwork</h2><button class="icon-btn" id="dr-x">✕</button></div>
      <div class="drawer-body">
        <div class="fld"><label>Title</label><input name="title" value="${esc(a.title)}"></div>
        <div class="fld"><label>Description</label><textarea name="description">${esc(a.description || "")}</textarea></div>
        <div class="fld-row">
          <div class="fld"><label>Medium</label><input name="medium" value="${esc(a.medium || "")}"></div>
          <div class="fld"><label>Dimensions</label><input name="dimensions" value="${esc(a.dimensions || "")}" placeholder="100cm × 100cm"></div>
        </div>
        <div class="fld-row">
          <div class="fld"><label>Year</label><input name="year" type="number" value="${a.year || ""}"></div>
          <div class="fld"><label>Price (display)</label><input name="price_display" value="${esc(a.price_display || "")}" placeholder="TZS 250,000"></div>
        </div>
        <div class="fld-row">
          <div class="fld"><label>Availability</label><select name="availability">
            ${AVAILABILITY.map((v) => `<option ${a.availability === v ? "selected" : ""}>${v}</option>`).join("")}
          </select></div>
          <div class="fld"><label>Collection / Series</label><select name="collection_id">${collOpts}</select></div>
        </div>
        <div class="fld"><label>Categories</label><div class="chip-row">
          ${CATEGORIES.map((c) => `<label class="chip"><input type="checkbox" value="${c}" ${(a.categories || []).includes(c) ? "checked" : ""}> ${c}</label>`).join("")}
        </div></div>
        <div class="fld-row">
          <label class="chip"><input type="checkbox" name="featured" ${a.featured ? "checked" : ""}> Feature on homepage</label>
          <label class="chip"><input type="checkbox" name="limited" ${(a.categories || []).includes("limited-edition") ? "checked" : ""}> Limited edition</label>
          <label class="chip"><input type="checkbox" name="archived" ${a.archived ? "checked" : ""}> Archived (hidden)</label>
        </div>
        <div class="fld"><label>Images</label>
          <div class="img-grid" id="img-grid"></div>
          <div class="dropzone" id="dz">Drop images here or click to upload · multiple allowed</div>
          <input type="file" id="file" accept="image/*" multiple hidden>
        </div>
      </div>
      <div class="drawer-foot">
        <button class="abtn abtn-ghost" id="dr-cancel">Close</button>
        <button class="abtn abtn-gold" id="dr-save">Save changes</button>
      </div>
    </div>`;
  document.body.appendChild(drawer);
  requestAnimationFrame(() => { $("#db", drawer).classList.add("open"); $("#dr", drawer).classList.add("open"); });

  const close = () => { $("#db", drawer).classList.remove("open"); $("#dr", drawer).classList.remove("open"); setTimeout(() => drawer.remove(), 350); renderArtworks(); };
  $("#dr-x", drawer).addEventListener("click", close);
  $("#dr-cancel", drawer).addEventListener("click", close);
  $("#db", drawer).addEventListener("click", close);

  const paintImages = () => {
    const grid = $("#img-grid", drawer);
    const imgs = (a.artwork_images || []).slice().sort((x, y) => (y.is_primary - x.is_primary) || (x.sort_order - y.sort_order));
    grid.innerHTML = imgs.length ? imgs.map((im) => `
      <div class="img-tile ${im.is_primary ? "primary" : ""}" data-id="${im.id}">
        ${im.is_primary ? '<span class="star">★</span>' : ""}
        <img src="${esc(mediaUrl(im.thumb_path || im.storage_path))}" alt="">
        <div class="bar">
          <button data-a="primary">Make cover</button>
          <button data-a="del">Delete</button>
        </div>
      </div>`).join("") : `<p style="color:#6f6f76;font-size:.85rem">No images yet.</p>`;
    grid.querySelectorAll(".img-tile").forEach((tile) => {
      const im = a.artwork_images.find((x) => x.id === tile.dataset.id);
      tile.querySelector('[data-a="primary"]').addEventListener("click", async () => {
        await sb.from("artwork_images").update({ is_primary: false }).eq("artwork_id", a.id);
        await sb.from("artwork_images").update({ is_primary: true }).eq("id", im.id);
        a.artwork_images.forEach((x) => (x.is_primary = x.id === im.id));
        paintImages(); toast("Cover updated");
      });
      tile.querySelector('[data-a="del"]').addEventListener("click", async () => {
        await sb.storage.from(MEDIA_BUCKET).remove([im.storage_path, im.thumb_path].filter(Boolean));
        await sb.from("artwork_images").delete().eq("id", im.id);
        a.artwork_images = a.artwork_images.filter((x) => x.id !== im.id);
        paintImages(); toast("Image removed");
      });
    });
  };
  a.artwork_images = a.artwork_images || [];
  paintImages();

  // uploads
  const fileInput = $("#file", drawer);
  const dz = $("#dz", drawer);
  dz.addEventListener("click", () => fileInput.click());
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("hover"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("hover"));
  dz.addEventListener("drop", (e) => { e.preventDefault(); dz.classList.remove("hover"); handleFiles(e.dataTransfer.files); });
  fileInput.addEventListener("change", () => handleFiles(fileInput.files));

  async function handleFiles(files) {
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    dz.textContent = `Processing ${list.length} image(s)…`;
    for (const file of list) {
      try {
        const meta = await uploadArtworkImage(file, a.id);
        const isPrimary = (a.artwork_images.length === 0);
        const { data, error } = await sb.from("artwork_images").insert({
          artwork_id: a.id, storage_path: meta.storage_path, thumb_path: meta.thumb_path,
          width: meta.width, height: meta.height, alt: a.title, is_primary: isPrimary,
          sort_order: a.artwork_images.length,
        }).select().single();
        if (error) throw error;
        a.artwork_images.push(data);
      } catch (err) { toast("Upload failed: " + err.message, true); }
    }
    dz.textContent = "Drop images here or click to upload · multiple allowed";
    paintImages();
    toast("Images uploaded");
  }

  // save
  $("#dr-save", drawer).addEventListener("click", async () => {
    const body = $(".drawer-body", drawer);
    const val = (n) => body.querySelector(`[name="${n}"]`).value.trim();
    const cats = [...body.querySelectorAll(".chip input[type=checkbox]:checked")]
      .map((c) => c.value).filter((v) => CATEGORIES.includes(v));
    if (body.querySelector('[name="limited"]').checked) cats.push("limited-edition");
    const title = val("title") || "Untitled";
    const patch = {
      title, slug: slugify(title) || a.slug, description: val("description"), medium: val("medium"),
      dimensions: val("dimensions"), year: parseInt(val("year")) || null, price_display: val("price_display"),
      availability: val("availability"), collection_id: body.querySelector('[name="collection_id"]').value || null,
      categories: cats,
      featured: body.querySelector('[name="featured"]').checked,
      archived: body.querySelector('[name="archived"]').checked,
    };
    const { data, error } = await sb.from("artworks").update(patch).eq("id", a.id).select("*, artwork_images(*)").single();
    if (error) return toast(error.message, true);
    Object.assign(a, data);
    const idx = state.artworks.findIndex((x) => x.id === a.id);
    if (idx >= 0) state.artworks[idx] = data;
    toast("Saved");
    close();
  });
}

async function uploadArtworkImage(file, artworkId) {
  const { full, fullExt, thumb, thumbExt, width, height } = await processImage(file);
  const id = randomId();
  const storage_path = `artworks/${artworkId}/${id}.${fullExt}`;
  const thumb_path = `thumbs/${artworkId}/${id}.${thumbExt}`;
  let r = await sb.storage.from(MEDIA_BUCKET).upload(storage_path, full, { contentType: full.type, upsert: true });
  if (r.error) throw r.error;
  r = await sb.storage.from(MEDIA_BUCKET).upload(thumb_path, thumb, { contentType: thumb.type, upsert: true });
  if (r.error) throw r.error;
  return { storage_path, thumb_path, width, height };
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------
function renderCollections() {
  const rows = state.collections;
  $("#view").innerHTML = `
    <div class="page-head"><div><h1>Collections</h1><div class="muted">Group artworks into series</div></div>
      <button class="abtn abtn-gold" id="add-col">＋ Add collection</button></div>
    <div class="aw-list">${rows.length ? rows.map((c) => `
      <div class="aw-row" style="grid-template-columns:1fr auto">
        <div class="aw-meta"><div class="t">${esc(c.title)}</div><div class="s">${esc(c.description || "")}</div></div>
        <div class="aw-actions">
          <button class="abtn abtn-ghost" data-edit="${c.id}">Edit</button>
          <button class="icon-btn abtn-danger" data-del="${c.id}">🗑</button>
        </div>
      </div>`).join("") : `<div class="empty">No collections yet.</div>`}</div>`;
  $("#add-col").addEventListener("click", () => editCollection(null));
  $("#view").querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => editCollection(state.collections.find((c) => c.id === b.dataset.edit))));
  $("#view").querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => delCollection(b.dataset.del)));
}

async function editCollection(c) {
  const title = prompt("Collection title", c ? c.title : "");
  if (title == null) return;
  const description = prompt("Short description", c ? c.description || "" : "") || "";
  const payload = { title: title.trim(), slug: slugify(title), description, sort_order: c ? c.sort_order : state.collections.length };
  const q = c ? sb.from("collections").update(payload).eq("id", c.id) : sb.from("collections").insert(payload);
  const { error } = await q;
  if (error) return toast(error.message, true);
  await loadAll(); renderCollections(); toast("Saved");
}

async function delCollection(id) {
  if (!confirm("Delete this collection? Artworks are kept (just un-grouped).")) return;
  const { error } = await sb.from("collections").delete().eq("id", id);
  if (error) return toast(error.message, true);
  await loadAll(); renderCollections(); toast("Deleted");
}

// ---------------------------------------------------------------------------
// Site content
// ---------------------------------------------------------------------------
async function renderContent() {
  $("#view").innerHTML = `<div class="page-head"><div><h1>Site Content</h1><div class="muted">Edit text & images shown across the public site</div></div></div><div class="spin"></div>`;
  const { data } = await sb.from("site_content").select("key,value");
  const map = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  const body = CONTENT_FIELDS.map((f) => {
    if (f.group) return `<h3 style="font-family:var(--display);color:var(--gold-soft);margin:26px 0 12px;font-weight:600">${esc(f.group)}</h3>`;
    const v = map[f.key] ?? "";
    if (f.type === "image") {
      return `<div class="fld"><label>${esc(f.label)}</label>
        <div style="display:flex;gap:14px;align-items:center">
          <img src="${esc(mediaUrl(v))}" alt="" style="width:70px;height:70px;object-fit:cover;border-radius:6px;background:#0f0f16" onerror="this.style.opacity=.2">
          <input type="file" accept="image/*" data-imgkey="${f.key}">
          <input type="hidden" name="${f.key}" value="${esc(v)}">
        </div></div>`;
    }
    if (f.type === "area") return `<div class="fld"><label>${esc(f.label)}</label><textarea name="${esc(f.key)}">${esc(v)}</textarea></div>`;
    return `<div class="fld"><label>${esc(f.label)}</label><input name="${esc(f.key)}" value="${esc(v)}"></div>`;
  }).join("");
  $("#view").innerHTML = `
    <div class="page-head"><div><h1>Site Content</h1><div class="muted">Edit text & images shown across the public site</div></div>
      <button class="abtn abtn-gold" id="save-content">Save all</button></div>
    <div style="max-width:720px">${body}</div>`;

  $("#view").querySelectorAll("[data-imgkey]").forEach((inp) =>
    inp.addEventListener("change", async () => {
      const file = inp.files[0]; if (!file) return;
      inp.disabled = true;
      try {
        const { full, fullExt } = await processImage(file, { maxDim: 1200 });
        const path = `content/${inp.dataset.imgkey}-${randomId()}.${fullExt}`;
        const r = await sb.storage.from(MEDIA_BUCKET).upload(path, full, { contentType: full.type, upsert: true });
        if (r.error) throw r.error;
        inp.closest(".fld").querySelector('input[type=hidden]').value = path;
        inp.closest(".fld").querySelector("img").src = mediaUrl(path);
        toast("Image ready — remember to Save all");
      } catch (e) { toast(e.message, true); }
      inp.disabled = false;
    })
  );

  $("#save-content").addEventListener("click", async () => {
    const rows = [];
    $("#view").querySelectorAll("[name]").forEach((el) => rows.push({ key: el.getAttribute("name"), value: el.value }));
    const { error } = await sb.from("site_content").upsert(rows, { onConflict: "key" });
    if (error) return toast(error.message, true);
    toast("Content saved");
  });
}

boot();
