// Lazily creates a single Supabase client from the CDN ESM build.
// Returns null when credentials are absent (seed mode).
import { SUPABASE_URL, SUPABASE_ANON_KEY, USE_SUPABASE } from "./config.js";

let _client = null;
let _loading = null;

export async function getSupabase() {
  if (!USE_SUPABASE) return null;
  if (_client) return _client;
  if (!_loading) {
    _loading = import("https://esm.sh/@supabase/supabase-js@2").then(({ createClient }) => {
      _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
      return _client;
    });
  }
  return _loading;
}
