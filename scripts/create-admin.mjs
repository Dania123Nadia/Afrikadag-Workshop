// Creates (or promotes) a facilitator account.
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-admin.mjs email@example.org 'StrongPassword'
import { createClient } from "@supabase/supabase-js";

const [email, password] = process.argv.slice(2);
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !password || !url || !key) {
  console.error("Usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/create-admin.mjs <email> <password>");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

let userId;
const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
if (error) {
  // user may already exist: look it up
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const u = list?.users?.find((x) => x.email?.toLowerCase() === email.toLowerCase());
  if (!u) { console.error(error.message); process.exit(1); }
  userId = u.id;
  await sb.auth.admin.updateUserById(userId, { password });
} else userId = data.user.id;

const { error: e2 } = await sb.from("admins").upsert({ user_id: userId, email });
if (e2) { console.error(e2.message); process.exit(1); }
console.log(`✓ ${email} is a facilitator (admin).`);
