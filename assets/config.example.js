// Copy this file to `config.js` and fill in your Supabase project values.
// Both values are PUBLIC (safe to expose). Security comes from RLS.
export const SUPABASE_URL = "https://YOUR-PROJECT-ref.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR-PUBLIC-ANON-KEY";
export const MEDIA_BUCKET = "media";
export const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
