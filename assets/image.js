// -----------------------------------------------------------------------------
// Client-side image processing for the admin dashboard.
// Produces an optimized full-size image (max 1600px) and a thumbnail (max 480px),
// both WebP with a JPEG fallback, preserving aspect ratio and good quality.
// Runs entirely in the browser before upload — no server processing needed.
// -----------------------------------------------------------------------------

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function drawScaled(img, maxDim) {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return { canvas, w, h };
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

async function encode(canvas, quality) {
  // Prefer WebP; fall back to JPEG if the browser can't encode WebP.
  let blob = await toBlob(canvas, "image/webp", quality);
  let ext = "webp";
  if (!blob) {
    blob = await toBlob(canvas, "image/jpeg", quality);
    ext = "jpg";
  }
  return { blob, ext };
}

/**
 * @param {File} file
 * @param {{maxDim?:number, thumbDim?:number, quality?:number, thumbQuality?:number}} [opts]
 * @returns {Promise<{full:Blob, fullExt:string, thumb:Blob, thumbExt:string, width:number, height:number}>}
 */
export async function processImage(file, opts = {}) {
  const { maxDim = 1600, thumbDim = 480, quality = 0.82, thumbQuality = 0.72 } = opts;
  const img = await loadImage(file);

  const full = drawScaled(img, maxDim);
  const thumb = drawScaled(img, thumbDim);

  const [f, t] = await Promise.all([
    encode(full.canvas, quality),
    encode(thumb.canvas, thumbQuality),
  ]);

  return {
    full: f.blob,
    fullExt: f.ext,
    thumb: t.blob,
    thumbExt: t.ext,
    width: full.w,
    height: full.h,
  };
}

export function randomId() {
  return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
}
