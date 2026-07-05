// -----------------------------------------------------------------------------
// Public rendering + content hydration.
// Rebuilds the featured (home) and full (gallery) grids from the data layer using
// the SAME markup/classes as the original design, then wires the artwork modal.
// Also hydrates CMS text/images via [data-cms] / [data-cms-img] attributes so the
// static HTML remains the SEO-friendly default and is enhanced when data differs.
// -----------------------------------------------------------------------------
import { getArtworks, getFeatured, getContent, getLimitedEdition, getTestimonials, submitTestimonial, mediaUrl } from "./data.js";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const STATUS_LABEL = { available: "Available", reserved: "Reserved", sold: "Sold", unavailable: "Unavailable" };

// Registry consumed by the shared modal (window.artworks). Merges so multiple
// renderers (gallery grid + limited-edition strip) can coexist on one page.
function registerForModal(list) {
  window.artworks = window.artworks || {};
  for (const a of list) {
    window.artworks[a.id] = {
      title: a.title,
      image: a.image,
      medium: a.medium,
      size: a.dimensions,
      description: a.description,
      year: a.year,
      status: STATUS_LABEL[a.availability] || a.availability,
      price: a.price_display,
    };
  }
}

function artCardHtml(a, i) {
  return `<div class="art-card reveal" onclick="openArtworkModal('${esc(a.id)}')">
    <span class="art-badge ${a.availability === "sold" ? "sold" : ""}">${esc(STATUS_LABEL[a.availability] || "Available")}</span>
    <img src="${esc(a.thumb || a.image)}" alt="${esc(a.title)}" loading="lazy">
    <div class="art-overlay">
      <span class="num">${a.year ? esc(a.year) : "Work " + String(i + 1).padStart(2, "0")}</span>
      <h3>${esc(a.title)}</h3>
      <span class="view">View Piece →</span>
    </div>
  </div>`;
}

// ---- home: featured grid ----
export async function renderFeatured(selector = "#featured-grid", limit = 3) {
  const grid = document.querySelector(selector);
  if (!grid) return;
  try {
    const items = await getFeatured(limit);
    registerForModal(items);
    grid.innerHTML = items.map((a, i) => artCardHtml(a, i)).join("");
    reveal(grid);
  } catch (e) {
    console.error("renderFeatured", e);
  }
}

// ---- Limited edition: attention marquee + luxury grid ----
export async function renderLimited({ marquee, grid, limit = 12 } = {}) {
  let items = [];
  try { items = await getLimitedEdition(limit); } catch (e) { console.error("renderLimited", e); }
  const mqWrap = marquee ? document.querySelector(marquee) : null;
  const gr = grid ? document.querySelector(grid) : null;

  if (!items.length) {
    // Nothing flagged yet — hide the dynamic parts, keep the section's copy.
    if (mqWrap) mqWrap.style.display = "none";
    if (gr) gr.style.display = "none";
    return;
  }
  registerForModal(items);

  if (mqWrap) {
    // duplicate the set so the track loops seamlessly
    const loop = [...items, ...items];
    mqWrap.innerHTML = `<div class="lux-marquee-track">${loop.map((a) => `
      <button class="lux-marquee-item" type="button" onclick="openArtworkModal('${esc(a.id)}')" aria-label="${esc(a.title)}">
        <img src="${esc(a.thumb || a.image)}" alt="${esc(a.title)}" loading="lazy">
        <span>${esc(a.title)}</span>
      </button>`).join("")}</div>`;
    mqWrap.style.display = "";
  }
  if (gr) {
    gr.innerHTML = items.map((a, i) => artCardHtml(a, i)).join("");
    gr.style.display = "";
    reveal(gr);
  }
}

// ---- Collector testimonials (auto-updating) ----
export async function renderTestimonials(gridSel = "#testi-grid") {
  const grid = document.querySelector(gridSel);
  if (!grid) return;
  let items = [];
  try { items = await getTestimonials(); } catch (e) { console.error("testimonials", e); }
  if (!items || !items.length) return; // keep whatever static markup exists
  grid.innerHTML = items.map((t) => `
    <div class="testi reveal">
      <div class="mark">"</div>
      <p>${esc(t.quote)}</p>
      <div class="author">— ${esc(t.name)}${t.role_title ? ", " + esc(t.role_title) : ""}${t.location ? " · " + esc(t.location) : ""}</div>
    </div>`).join("");
  reveal(grid);
}

export function wireTestimonialForm(formSel = "#testimonial-form", gridSel = "#testi-grid") {
  const form = document.querySelector(formSel);
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = "Submitting…";
    const f = new FormData(form);
    try {
      await submitTestimonial({
        name: f.get("name"), location: f.get("location"),
        title: f.get("title"), quote: f.get("testimonial"),
      });
      form.reset();
      await renderTestimonials(gridSel);
      alert("Thank you! Your testimonial is now live on the site.");
    } catch (err) {
      // Fallback to email if the backend/table isn't available.
      try {
        await fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } });
        alert("Thank you for your testimonial! It has been submitted.");
        form.reset();
      } catch { alert("Sorry — could not submit right now. Please try again later."); }
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  });
}

// ---- gallery: full grid + filtering ----
let _all = [];
export async function renderGallery(selector = "#gallery-grid") {
  const grid = document.querySelector(selector);
  if (!grid) return;
  try {
    _all = await getArtworks();
    registerForModal(_all);
    paintGallery(grid, _all);
    // Expose a filter fn compatible with the existing filter buttons.
    window.filterGallery = (category) => {
      document.querySelectorAll(".filter-btn").forEach((b) => {
        const label = b.textContent.trim().toLowerCase();
        b.classList.toggle("active", label === category || (category === "all" && label === "all"));
      });
      const rows = category === "all" ? _all : _all.filter((a) => a.categories.includes(category));
      registerForModal(rows);
      paintGallery(grid, rows);
    };
  } catch (e) {
    console.error("renderGallery", e);
    grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--muted)">Unable to load the collection right now.</p>`;
  }
}

function paintGallery(grid, rows) {
  grid.innerHTML = rows.map((a) => `
    <div class="artwork ${a.categories.map(esc).join(" ")}" data-artwork-id="${esc(a.id)}" onclick="openArtworkModal('${esc(a.id)}')" role="button" tabindex="0" aria-label="${esc(a.title)} — view details">
      <div class="artwork-status ${a.availability === "sold" ? "sold" : ""}">${esc(STATUS_LABEL[a.availability] || "Available")}</div>
      <img src="${esc(a.thumb || a.image)}" alt="${esc(a.title)}" loading="lazy">
      <h2>${esc(a.title)}</h2>
      <button class="view-details-btn" type="button">View Details</button>
    </div>`).join("");
  // fade cards in as their images load
  grid.querySelectorAll(".artwork").forEach((card) => {
    const img = card.querySelector("img");
    if (!img || img.complete) card.classList.add("loaded");
    else {
      img.addEventListener("load", () => card.classList.add("loaded"));
      img.addEventListener("error", () => card.classList.add("loaded"));
    }
  });
}

// ---- CMS hydration ----
export async function hydrateContent() {
  let c;
  try { c = await getContent(); } catch { return; }
  // Derived convenience values for href bindings.
  if (c.email) c.email_mailto = `mailto:${c.email}`;
  if (c.phone) c.phone_tel = `tel:${c.phone.replace(/[^\d+]/g, "")}`;
  // text nodes: <span data-cms="email"></span>
  document.querySelectorAll("[data-cms]").forEach((el) => {
    const key = el.getAttribute("data-cms");
    if (c[key] == null || c[key] === "") return;
    if (el.hasAttribute("data-cms-html")) el.innerHTML = c[key];
    else el.textContent = c[key];
  });
  // attribute bindings: <a data-cms-attr="href:instagram_url">
  document.querySelectorAll("[data-cms-attr]").forEach((el) => {
    el.getAttribute("data-cms-attr").split(",").forEach((pair) => {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      if (attr && key && c[key]) el.setAttribute(attr, c[key]);
    });
  });
  // images: <img data-cms-img="profile_image">
  document.querySelectorAll("[data-cms-img]").forEach((el) => {
    const key = el.getAttribute("data-cms-img");
    if (c[key]) el.src = mediaUrl(c[key]);
  });
  // background images: <div data-cms-bg="hero_image">
  document.querySelectorAll("[data-cms-bg]").forEach((el) => {
    const key = el.getAttribute("data-cms-bg");
    if (c[key]) el.style.backgroundImage = `url('${mediaUrl(c[key])}')`;
  });
  // whatsapp / mailto / tel helpers
  if (c.whatsapp) {
    document.querySelectorAll('[data-cms-wa]').forEach((el) => {
      el.href = `https://wa.me/${c.whatsapp}`;
    });
    window.whatsappNumber = c.whatsapp;
  }
}

// Re-run the shared scroll-reveal observer for freshly injected nodes.
function reveal(scope = document) {
  if (!("IntersectionObserver" in window)) {
    scope.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  scope.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
}

export { reveal };
