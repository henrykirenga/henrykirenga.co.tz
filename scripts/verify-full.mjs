// End-to-end verification against the live project.
// Public reads use the anon key; the CRUD/permission checks sign in as the admin.
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, MEDIA_BUCKET } from "../assets/config.js";

const pub = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const line = (ok, msg) => console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
const mediaUrl = (p) => `${SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/${p}`;
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; line(ok, msg); };

console.log("=== PUBLIC (anon) reads ===");
const { data: aw, error: awErr } = await pub
  .from("artworks").select("*, artwork_images(*)").eq("archived", false).order("sort_order");
check(!awErr && aw.length > 0, `artworks visible to public: ${awErr ? awErr.message : aw.length}`);
const withImg = (aw || []).filter((a) => (a.artwork_images || []).length > 0).length;
check(withImg > 0, `artworks with images: ${withImg}`);
const feat = (aw || []).filter((a) => a.featured).length;
check(feat >= 1, `featured artworks: ${feat}`);

const { data: content } = await pub.from("site_content").select("key,value");
check((content || []).length > 0, `site_content keys: ${(content || []).length}`);
const prof = (content || []).find((r) => r.key === "profile_image");
check(!!prof, `profile_image content present: ${prof ? prof.value : "—"}`);

console.log("\n=== IMAGE URLs (public CDN) ===");
const sample = (aw || []).find((a) => a.artwork_images?.length);
if (sample) {
  const im = sample.artwork_images.find((x) => x.is_primary) || sample.artwork_images[0];
  for (const [label, path] of [["full", im.storage_path], ["thumb", im.thumb_path]]) {
    const url = mediaUrl(path);
    const r = await fetch(url, { method: "HEAD" });
    check(r.status === 200, `${label} image 200 (${r.headers.get("content-type")}) ${path}`);
  }
}
// content image URL
if (prof && prof.value && !prof.value.startsWith("Image/")) {
  const r = await fetch(mediaUrl(prof.value), { method: "HEAD" });
  check(r.status === 200, `profile image 200 (${r.headers.get("content-type")})`);
}

console.log("\n=== ADMIN auth + is_admin ===");
const adm = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: signin, error: siErr } = await adm.auth.signInWithPassword({
  email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD,
});
check(!siErr && !!signin.session, `admin sign-in: ${siErr ? siErr.message : "ok (" + signin.user.email + ")"}`);
const { data: isAdm, error: iaErr } = await adm.rpc("is_admin");
check(!iaErr && isAdm === true, `is_admin() for admin = ${iaErr ? iaErr.message : isAdm}`);

console.log("\n=== ADMIN CRUD (create → edit → images → delete) ===");
const slug = "verify-tmp-" + Date.now();
const { data: created, error: cErr } = await adm.from("artworks")
  .insert({ title: "Verify Temp", slug, availability: "available" }).select("id").single();
check(!cErr && created?.id, `CREATE artwork: ${cErr ? cErr.message : created.id}`);
if (created?.id) {
  const { error: uErr } = await adm.from("artworks").update({ title: "Verify Temp (edited)", featured: true }).eq("id", created.id);
  check(!uErr, `UPDATE artwork: ${uErr ? uErr.message : "ok"}`);
  const { error: imgErr } = await adm.from("artwork_images")
    .insert({ artwork_id: created.id, storage_path: "artworks/x/probe.webp", is_primary: true });
  check(!imgErr, `INSERT artwork_image: ${imgErr ? imgErr.message : "ok"}`);
  const { error: dErr } = await adm.from("artworks").delete().eq("id", created.id);
  check(!dErr, `DELETE artwork (cascade images): ${dErr ? dErr.message : "ok"}`);
  const { count } = await adm.from("artwork_images").select("id", { count: "exact", head: true }).eq("artwork_id", created.id);
  check(count === 0, `cascade removed images: remaining=${count}`);
}

console.log("\n=== ADMIN site_content write ===");
{
  const { error: wErr } = await adm.from("site_content").upsert({ key: "__verify_tmp", value: "x" }, { onConflict: "key" });
  check(!wErr, `UPSERT site_content: ${wErr ? wErr.message : "ok"}`);
  const { error: dErr } = await adm.from("site_content").delete().eq("key", "__verify_tmp");
  check(!dErr, `DELETE site_content: ${dErr ? dErr.message : "ok"}`);
}

await adm.auth.signOut();
console.log(`\n${fails === 0 ? "✅ ALL CHECKS PASSED" : "❌ " + fails + " CHECK(S) FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
