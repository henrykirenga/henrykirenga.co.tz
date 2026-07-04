// Read-only health check using the PUBLIC (anon/publishable) key.
// Confirms schema, read RLS, write protection, and storage bucket.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, MEDIA_BUCKET } from "../assets/config.js";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const line = (ok, msg) => console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);

console.log("URL:", SUPABASE_URL);
console.log("Key prefix:", SUPABASE_ANON_KEY.slice(0, 12), "…\n");

// 1. tables exist + public read works
for (const t of ["artworks", "artwork_images", "collections", "site_content"]) {
  const { error, count } = await sb.from(t).select("*", { count: "exact", head: true });
  line(!error, `read ${t} ${error ? "→ " + error.message : "(rows: " + count + ")"}`);
}

// 2. write protection (anon must be blocked by RLS)
{
  const { error } = await sb.from("artworks").insert({ title: "RLS probe", slug: "rls-probe-" + Date.now() });
  line(!!error, `anon INSERT blocked by RLS ${error ? "(" + (error.code || error.message) + ")" : "→ NOT BLOCKED!"}`);
}

// 3. storage bucket reachable (public read)
{
  const { error } = await sb.storage.from(MEDIA_BUCKET).list("", { limit: 1 });
  line(!error, `storage bucket "${MEDIA_BUCKET}" list ${error ? "→ " + error.message : "ok"}`);
}

// 4. is_admin() function callable (should return false for anon)
{
  const { data, error } = await sb.rpc("is_admin");
  line(!error, `rpc is_admin() ${error ? "→ " + error.message : "= " + data}`);
}
console.log("\nDone.");
