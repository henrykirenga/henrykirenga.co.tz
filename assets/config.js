// -----------------------------------------------------------------------------
// Public runtime configuration.
//
// The Supabase URL and ANON key are PUBLIC by design — they are safe to commit
// and ship to the browser. All security is enforced by Row Level Security (RLS)
// in the database. NEVER put the service_role key here.
//
// Leave these empty to run the site in "seed mode" (renders from
// assets/seed/*.json — identical to the original hardcoded content).
// Fill them in to switch the whole site + admin to the live Supabase backend.
// See README.md → "Setup".
// -----------------------------------------------------------------------------
export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";

// Public storage bucket that holds artwork + content images.
export const MEDIA_BUCKET = "media";

// True once real credentials are present.
export const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
