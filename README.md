# Afrikadag Workshop Platform

An interactive, real-time stakeholder workshop on labour migration between Kenya and the Netherlands.
Up to ~70 participants (configurable) join from their phone with a QR code, a link or a workshop code, are allocated
to a stakeholder group by their table number, and work together in a shared group workspace. Facilitators run
the session from a password-protected dashboard and see all input live.

**Stack:** Next.js 15 (App Router, client components) · Tailwind CSS v4 · Supabase (Postgres, Auth, Realtime, RLS)

---

## 1. What's in it

| Area | Route | What it does |
|---|---|---|
| Join | `/` (or `/?code=CODE` from the QR) | Code → table number (button grid) → optional first name. No account. |
| Participant | `/w/CODE` | Persistent progress tracker, timer, "current step / what next" card, stage content, group workspace, reference drawer ("Proposal & role"). |
| Facilitator login | `/admin` | E-mail + password. Lists workshops, creates new ones from the Afrikadag template. |
| Live dashboard | `/admin/w/:id` | Stats, live group cards, full group workspace drawer (live draft / submitted versions / participants), stage + timer controls, announcements, QR, CSV/JSON export. |
| Insights | `/admin/w/:id/insights` | Rule-based patterns (no AI): most mentioned opportunities/risks/recommendations, common concerns across groups, conflicting perspectives, distinctive recommendations, tagged items, takeaways side by side, all original responses. |
| Presentation | `/admin/w/:id/present` | Full-screen slides: join screen, proposal, groups overview, one slide per group with 1-minute pitch timer, cross-group opportunities / concerns / recommendations, disagreements, insights. Keyboard ← → , `f` fullscreen. Facilitator stars which contributions are shown. |
| Setup | `/admin/w/:id/setup` | Settings, tables → stakeholder mapping, stakeholder profiles + guiding questions, stages, introduction texts, data deletion. |

### Workshop stages (default template, all editable)
1. Introduction (10 min) · 2. Understanding the proposal (10) · 3. Stakeholder assignment (5) · 4. Group discussion (20) · 5. Submit your insights (5) · 6. Presentations and reflection (15)

### Group workspace
1. First reaction (individual, visible to the group) · 2. Guiding questions · 3. Shared discussion notes · 4. Opportunities · 5. Risks & challenges · 6. Recommendations · 7. Key takeaway (required) · Submit.

Stakeholder profiles are clearly marked as **illustrative** and do not attribute positions to real organisations.

---

## 2. How it works technically

- **Participants** get a Supabase *anonymous* session (kept in the browser), then call `join_workshop(code, table, name)`.
  Refreshing, closing the tab or losing Wi-Fi keeps the same identity; returning shows "Continue where you left off".
- **RLS everywhere.** Participants can only read their own workshop's configuration and only their own group's workspace,
  cannot see other participants, cannot curate/tag, and cannot call facilitator functions. Facilitators are listed in `public.admins`.
- **Shared text fields** use optimistic versioning plus a 3-way merge (diff-match-patch): concurrent typing at a table is merged, not overwritten.
  Unsaved edits are also stored in `localStorage` and merged back after a refresh.
- **Idea cards** (opportunities/risks/recommendations) are one row each, so parallel additions never conflict.
- **Realtime:** Postgres changes (RLS-filtered) for state and content; Presence for "connected / working now" counts (no names);
  Broadcast for "someone is typing". Clients re-fetch after reconnecting and whenever the tab becomes visible.
- **Timer** is server-authoritative (`timer_ends_at`), clients correct for clock skew.
- **Draft vs submitted:** live content is always visible to facilitators; `submit_group()` stores an immutable snapshot in `submissions`.
  If a group edits after submitting, the dashboard and the group see "edited after submit".
- **Privacy:** names optional (can be turned off), exports contain no names, "Delete participant data" removes participants,
  all content, submissions, announcements and the anonymous auth users.

Database: `supabase/migrations/20261103000000_workshop_schema.sql` (tables, RLS policies, RPCs, triggers, realtime publication).

---

## 3. Set up for the event

### a) Supabase project
1. Create a project at supabase.com (EU region recommended).
2. Run the migration: either `npx supabase link --project-ref <ref> && npx supabase db push`, or paste the SQL file into the SQL editor.
3. **Authentication → Sign In / Providers:** enable **Anonymous sign-ins**.
4. **Authentication → Rate limits:** raise *anonymous sign-ins per hour per IP* to **at least 150**.
   ⚠️ The default is 30/hour per IP, and at a venue everyone usually shares one public IP through the Wi-Fi. If you skip this, participant 31+ cannot join.
5. Realtime is enabled by the migration (tables are added to `supabase_realtime`).
6. **Use the Pro plan for the event day** (you can downgrade afterwards). Supabase Realtime limits *messages per second* per project.
   In our simulation, 35 of 70 people typing at the same time produced about **170 realtime messages/second**. That is above the Free plan's limit
   (roughly 100/s) but comfortably inside Pro (roughly 500/s). Check the current numbers on supabase.com/docs/guides/realtime/quotas.
   If the limit is hit anyway, nothing is lost: all input is saved in the database, and participant screens fall back to checking the
   workshop state every 20 seconds and reloading while the realtime connection is down.

### b) Facilitator account
```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
  node scripts/create-admin.mjs facilitator@yourorg.org 'a-strong-password'
```
(or create the user in the dashboard and run `select public.grant_admin('facilitator@yourorg.org');` in the SQL editor).
Never put the service-role key in the frontend or in `.env` files that are deployed.

### c) Run / deploy the app
```bash
cp .env.example .env.local   # fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev                  # http://localhost:3000
```
Deploy to Vercel (or any Node host): import the repo, set the two `NEXT_PUBLIC_…` environment variables, deploy.
In Supabase → Authentication → URL configuration, set the Site URL to the deployed URL.

### d) On the day
1. `/admin` → create the workshop (choose a short code and the number of tables) → Setup: check the table mapping and texts.
2. Put **Presentation → Join** on the big screen (QR + code).
3. Use **Start workshop**, **Next stage**, timer and announcements from the dashboard. Participants' screens follow automatically.
4. During presentations, step through the group slides; participants see "Now presenting".
5. Afterwards: export CSV/JSON, then **Setup → Delete participant data**.

---

## 4. Testing

Local Supabase (Docker) + the app:
```bash
npx supabase start
npx supabase db reset                         # applies the migration
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<local service key> node scripts/create-admin.mjs facilitator@example.org 'Workshop2026!'
npm run build && npm start
```
- **Load + correctness simulation** (70 participants: stage-change latency, 30 s of realistic typing load, worst-case simultaneous saves, isolation, reconnect, submit, lock):
  `NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/simulate.mjs 70`
- **Browser walkthrough** (facilitator on desktop + 3 participants on iPhone viewports, screenshots):
  `BASE_URL=http://127.0.0.1:3000 ADMIN_EMAIL=… ADMIN_PASSWORD=… SHOTS=./shots node scripts/e2e.cjs`

Both can also be run against the real project before the event (the simulation deletes its own test workshop afterwards).
`supabase/config.toml` enables anonymous sign-ins with a raised limit for local testing.

---

## 5. Known limitations
- Shared notes merge concurrent edits, but there are no live cursors of other people (Google-Docs style). A "someone at your table is editing this too" hint is shown.
- Other people's edits appear about 1–2 seconds after they stop typing (autosave debounce chosen to stay within Realtime quotas).
- Pattern insights are keyword based (English-oriented stop words). They point to original responses and do not interpret them. No AI summaries are included.
- The facilitator's 1-minute pitch timer runs locally on the presentation screen (not synced to phones).
- Participants who switch phone or clear their browser re-join as a new participant (their group's work is unaffected).
