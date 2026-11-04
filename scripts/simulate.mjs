// Load & correctness test: simulates a full room against a real Supabase project.
//
//   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… \
//   ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/simulate.mjs [participants=70]
//
// What it checks
//  1. N participants join anonymously via table numbers (no accounts)
//  2. Everyone receives a stage change in real time (latency is reported)
//  3. Everyone in a group types into the SAME shared notes field at the same
//     time; with the merge algorithm no line may be lost
//  4. Ideas (opportunities/risks/recommendations) added in parallel all arrive
//  5. RLS: nobody can read another group's workspace
//  6. The facilitator receives live updates before anything is submitted
//  7. Reconnect: a client that was offline catches up after reconnecting
//  8. Submissions + lock
// The test workshop is deleted at the end (including the anonymous users).
import { createClient } from "@supabase/supabase-js";
import { merge3 } from "../src/lib/merge3.mjs"; // the exact merge used by the app

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const N = Number(process.argv[2] ?? 70);
const TABLES = 10;
if (!URL || !ANON || !process.env.ADMIN_EMAIL) { console.error("Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, ADMIN_EMAIL, ADMIN_PASSWORD"); process.exit(1); }

const mk = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` (${detail})` : ""}`); };
const waitFor = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(150); } return false; };

// ---- facilitator
const admin = mk();
{
  const { error } = await admin.auth.signInWithPassword({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  if (error) { console.error("Admin login failed:", error.message); process.exit(1); }
}
const code = "SIM" + Math.floor(1000 + Math.random() * 8999);
const { data: wid, error: ce } = await admin.rpc("admin_create_workshop", { p_title: "Simulation", p_code: code, p_tables: TABLES });
if (ce) { console.error(ce.message); process.exit(1); }
console.log(`Workshop ${code} created. Simulating ${N} participants at ${TABLES} tables…\n`);

let adminEvents = 0;
const adminCh = admin.channel("sim-admin")
  .on("postgres_changes", { event: "*", schema: "public", table: "group_fields", filter: `workshop_id=eq.${wid}` }, () => adminEvents++)
  .on("postgres_changes", { event: "*", schema: "public", table: "response_items", filter: `workshop_id=eq.${wid}` }, () => adminEvents++);
await new Promise((res) => adminCh.subscribe((s) => s === "SUBSCRIBED" && res()));

try {
  // ---- 1. join
  const t0 = Date.now();
  const people = await Promise.all(Array.from({ length: N }, async (_, i) => {
    const db = mk();
    const { error: ae } = await db.auth.signInAnonymously();
    if (ae) throw new Error(`anon sign-in ${i}: ${ae.message}`);
    const table = (i % TABLES) + 1;
    const { data, error } = await db.rpc("join_workshop", { p_code: code.toLowerCase(), p_table: table, p_name: `P${i + 1}` });
    if (error) throw new Error(`join ${i}: ${error.message}`);
    return { i, db, table, me: data, stageSeen: null, fieldsSeen: 0 };
  }));
  check(`${N} participants joined without accounts`, people.length === N, `${Date.now() - t0} ms`);
  const groups = [...new Set(people.map((p) => p.me.group_id))];
  check("Tables mapped automatically to stakeholder groups", groups.length === Math.min(5, TABLES));
  const sameTableSameGroup = people.every((p) => people.filter((q) => q.table === p.table).every((q) => q.me.group_id === p.me.group_id));
  check("Everyone at the same table is in the same group", sameTableSameGroup);

  // ---- realtime subscriptions for every participant
  await Promise.all(people.map((p) => new Promise((res, rej) => {
    p.ch = p.db.channel(`sim-${p.i}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "workshops", filter: `id=eq.${wid}` }, (e) => { if (p.stageSeen == null) p.stageSeen = { stage: e.new.current_stage, at: Date.now() }; })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_fields", filter: `group_id=eq.${p.me.group_id}` }, (e) => { p.fieldsSeen++; p.lastNotes = e.new; })
      .subscribe((s) => { if (s === "SUBSCRIBED") res(); if (s === "CHANNEL_ERROR") rej(new Error("subscribe failed")); });
  })));
  check(`${N} real-time connections open`, true);
  await sleep(2000); // let the server finish registering every postgres_changes listener

  // ---- 2. stage change broadcast
  const tStage = Date.now();
  await admin.rpc("admin_control", { p_workshop: wid, p_action: "start", p_value: 3 });
  const allGot = await waitFor(() => people.every((p) => p.stageSeen?.stage === 3), 15000);
  const lat = people.filter((p) => p.stageSeen).map((p) => p.stageSeen.at - tStage).sort((a, b) => a - b);
  check("Every participant received the stage change in real time", allGot, `received ${lat.length}/${N}, median ${lat[Math.floor(lat.length / 2)]} ms, max ${lat[lat.length - 1]} ms`);

  // ---- 3. concurrent editing of one shared field per group
  async function appendLine(p, line) {
    // same algorithm as the app: optimistic version + 3-way merge on conflict
    const { data: row } = await p.db.from("group_fields").select("content,version").eq("group_id", p.me.group_id).eq("field", "notes").single();
    let base = row.content, version = row.version;
    let mine = `${base}\n${line}`;
    for (let attempt = 0; attempt < 50; attempt++) {
      const { data, error } = await p.db.rpc("save_group_field", { p_group: p.me.group_id, p_field: "notes", p_content: mine, p_base_version: version });
      if (error) throw error;
      const r = data[0];
      if (r.ok) return attempt;
      mine = merge3(base, mine, r.content);
      base = r.content; version = r.version;
      await sleep(Math.random() * 60);
    }
    throw new Error("too many conflicts");
  }
  // ---- 3a. realistic session: about half the room typing, autosaving every 1.2–4 s, for 30 s
  const SUSTAIN = Number(process.env.SUSTAIN_SECONDS ?? 30);
  people.forEach((p) => { p.fieldsSeen = 0; p.stageSeen = null; });
  const typists = people.filter((_, i) => i % 2 === 0);
  let saves = 0, stop = false;
  const tSus = Date.now();
  const loops = typists.map(async (p, k) => {
    let n = 0;
    await sleep(Math.random() * 3000);
    while (!stop) { await appendLine(p, `p${p.i + 1} thought ${++n}`); saves++; await sleep(1200 + Math.random() * 2800); }
  });
  await sleep((SUSTAIN * 1000) / 2);
  const tMid = Date.now();
  await admin.rpc("admin_control", { p_workshop: wid, p_action: "next" });
  const midOk = await waitFor(() => people.every((p) => p.stageSeen?.stage === 4), 15000);
  const midLat = people.filter((p) => p.stageSeen).map((p) => p.stageSeen.at - tMid).sort((a, b) => a - b);
  await sleep(Math.max(0, SUSTAIN * 1000 - (Date.now() - tSus)));
  stop = true; await Promise.all(loops);
  const secs = (Date.now() - tSus) / 1000;
  const delivered = people.reduce((a, p) => a + p.fieldsSeen, 0);
  check(`Realistic load: ${typists.length} people typing for ${Math.round(secs)} s, edits delivered live to their group`, people.every((p) => p.fieldsSeen > 0),
    `${saves} saves (${(saves / secs).toFixed(1)}/s), ${delivered} live updates received (${(delivered / secs).toFixed(0)} msg/s)`);
  check("Stage change during that load reached every participant", midOk, `${midLat.length}/${N}, max ${midLat[midLat.length - 1]} ms`);

  // ---- 3b. worst case: all participants save the same field in the same instant
  const tEdit = Date.now();
  const retries = await Promise.all(people.map((p) => appendLine(p, `line from participant ${p.i + 1}`)));
  const conflicts = retries.reduce((a, b) => a + b, 0);
  let lost = 0;
  for (const g of groups) {
    const { data } = await admin.from("group_fields").select("content").eq("group_id", g).eq("field", "notes").single();
    for (const p of people.filter((x) => x.me.group_id === g)) if (!data.content.includes(`line from participant ${p.i + 1}`)) lost++;
  }
  check(`Worst case, all ${N} people saving their group's shared notes in the same second: no text lost`, lost === 0, `${conflicts} conflicts auto-merged, ${Date.now() - tEdit} ms, ${lost} lines lost`);

  // ---- 4. ideas in parallel
  const kinds = ["opportunity", "risk", "recommendation"];
  await Promise.all(people.map((p) => p.db.from("response_items").insert({ group_id: p.me.group_id, kind: kinds[p.i % 3], text: `Idea ${p.i + 1}: fair recruitment and housing`, author_id: p.me.id })));
  const { count } = await admin.from("response_items").select("*", { count: "exact", head: true }).eq("workshop_id", wid);
  check("Parallel idea cards all stored", count === N, `${count}/${N}`);

  // ---- 5. isolation
  let leaks = 0;
  await Promise.all(people.slice(0, 20).map(async (p) => {
    const { data: its } = await p.db.from("response_items").select("group_id");
    const { data: fs } = await p.db.from("group_fields").select("group_id");
    const { data: ps } = await p.db.from("participants").select("id");
    if (its.some((x) => x.group_id !== p.me.group_id) || fs.some((x) => x.group_id !== p.me.group_id) || ps.length !== 1) leaks++;
    const { error } = await p.db.from("response_items").insert({ group_id: groups.find((g) => g !== p.me.group_id), kind: "risk", text: "intrusion", author_id: p.me.id });
    if (!error) leaks++;
    const { error: e2 } = await p.db.rpc("admin_control", { p_workshop: wid, p_action: "next" });
    if (!e2) leaks++;
  }));
  check("Participants cannot read or write other groups, see other people, or control the workshop", leaks === 0);

  // ---- 6. facilitator live view
  await sleep(1500);
  check("Facilitator received live draft updates before any submission", adminEvents >= N, `${adminEvents} events`);

  // ---- 7. reconnect
  const p0 = people[0];
  await p0.db.removeChannel(p0.ch);
  const mate = people.find((p) => p !== p0 && p.me.group_id === p0.me.group_id);
  await appendLine(mate, "written while P1 was offline");
  const { data: after } = await p0.db.from("group_fields").select("content").eq("group_id", p0.me.group_id).eq("field", "notes").single();
  check("Reconnecting client catches up on changes made while offline", after.content.includes("written while P1 was offline"));
  const { data: again } = await p0.db.rpc("join_workshop", { p_code: code, p_table: p0.table, p_name: null });
  check("Re-joining keeps the same participant (no duplicates)", again.id === p0.me.id && again.display_name === "P1");

  // ---- 8. submit + lock
  const rep = groups.map((g) => people.find((p) => p.me.group_id === g));
  await Promise.all(rep.map(async (p) => {
    const { data: r } = await p.db.from("group_fields").select("version").eq("group_id", p.me.group_id).eq("field", "key_takeaway").single();
    await p.db.rpc("save_group_field", { p_group: p.me.group_id, p_field: "key_takeaway", p_content: "Circular migration needs enforceable worker protections.", p_base_version: r.version });
  }));
  const subs = await Promise.all(rep.map((p) => p.db.rpc("submit_group", { p_group: p.me.group_id })));
  check("Each group submitted", subs.every((s) => !s.error && s.data.status === "submitted"));
  await admin.rpc("admin_control", { p_workshop: wid, p_action: "lock" });
  const { error: le } = await rep[0].db.rpc("save_group_field", { p_group: rep[0].me.group_id, p_field: "notes", p_content: "x", p_base_version: 999 });
  check("Locking stops further edits", !!le && le.message.includes("LOCKED"));

  await Promise.all(people.map((p) => p.db.removeAllChannels()));
} catch (e) {
  check("Simulation ran without errors", false, e.message);
} finally {
  const { error } = await admin.rpc("admin_delete_workshop", { p_workshop: wid });
  check("Test workshop and its anonymous users deleted", !error, error?.message);
  await admin.removeAllChannels();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
