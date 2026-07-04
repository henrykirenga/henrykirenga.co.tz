// Create (or promote) your admin login.
// Usage:  node scripts/create-admin.mjs
// Reads ADMIN_EMAIL / ADMIN_PASSWORD (and Supabase creds) from .env
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("Missing ADMIN_EMAIL / ADMIN_PASSWORD in .env");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// 1. Find or create the auth user.
let userId;
const { data: created, error: cErr } = await sb.auth.admin.createUser({
  email: ADMIN_EMAIL,
  password: ADMIN_PASSWORD,
  email_confirm: true,
});
if (cErr && !/already/i.test(cErr.message)) {
  console.error("createUser failed:", cErr.message);
  process.exit(1);
}
if (created?.user) {
  userId = created.user.id;
  console.log("Created auth user:", ADMIN_EMAIL);
} else {
  // already exists — look it up
  const { data: list } = await sb.auth.admin.listUsers();
  const found = list.users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());
  if (!found) { console.error("User exists but could not be located."); process.exit(1); }
  userId = found.id;
  console.log("User already existed:", ADMIN_EMAIL);
}

// 2. Add to admins allowlist.
const { error: aErr } = await sb.from("admins").upsert({ user_id: userId, email: ADMIN_EMAIL }, { onConflict: "user_id" });
if (aErr) { console.error("Could not add to admins:", aErr.message); process.exit(1); }

console.log("✓ Admin ready. Sign in at /admin/ with", ADMIN_EMAIL);
