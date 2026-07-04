// -----------------------------------------------------------------------------
// Public rendering + content hydration.
// Rebuilds the featured (home) and full (gallery) grids from the data layer using
// the SAME markup/classes as the original design, then wires the artwork modal.
// Also hydrates CMS text/images via [data-cms] / [data-cms-img] attributes so the
// static HTML remains the SEO-friendly default and is enhanced when data differs.
// -----------------------------------------------------------------------------
import { getArtworks, getFeatured, getContent, mediaUrl } from "./data.js";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const STATUS_LABEL = { available: "Available", reserved: "Reserved", sold: "Sold", unavailable: "Unavailable" };

// Registry consumed by the shared modal (assets/luxury.js reads window.artworks).
function registerForModal(list) {
  const map = {};
  for (const a of list) {
    map[a.id] = {
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
  window.artworks = map;
}

// ---- home: featured grid ----
export async function renderFeatured(selector = "#featured-grid", limit = 3) {
  const grid = document.querySelector(selector);
  if (!grid) return;
  try {
    const items = await getFeatured(limit);
    registerForModal(items);
    grid.innerHTML = items.map((a, i) => `
      <div class="art-card reveal" onclick="openArtworkModal('${esc(a.id)}')">
        <span class="art-badge ${a.availability === "sold" ? "sold" : ""}">${esc(STATUS_LABEL[a.availability] || "Available")}</span>
        <img src="${esc(a.thumb || a.image)}" alt="${esc(a.title)}" loading="lazy">
        <div class="art-overlay">
          <span class="num">Work ${String(i + 1).padStart(2, "0")}</span>
          <h3>${esc(a.title)}</h3>
          <span class="view">View Piece →</span>
        </div>
      </div>`).join("");
    reveal(grid);
  } catch (e) {
    console.error("renderFeatured", e);
  }
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
    <div class="artwork ${a.categories.map(esc).join(" ")}" data-artwork-id="${esc(a.id)}">
      <div class="artwork-status ${a.availability === "sold" ? "sold" : ""}">${esc(STATUS_LABEL[a.availability] || "Available")}</div>
      <img src="${esc(a.thumb || a.image)}" alt="${esc(a.title)}" loading="lazy" onclick="openArtworkModal('${esc(a.id)}')">
      <h2>${esc(a.title)}</h2>
      <button class="view-details-btn" onclick="openArtworkModal('${esc(a.id)}')">View Details</button>
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
