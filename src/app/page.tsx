"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/ui/Brand";
import { GroupBadge } from "@/components/ui/GroupIcon";
import { friendlyError, isConfigured, participantDb } from "@/lib/supabase";
import { tableLabel, type NamedTable } from "@/lib/tables";

interface Lookup { title: string; subtitle: string | null; ask_names: boolean; status: string; tables: number[] }

function JoinInner() {
  const params = useSearchParams();
  const router = useRouter();
  const db = participantDb();
  const [code, setCode] = useState((params.get("code") ?? "").toUpperCase());
  const [info, setInfo] = useState<Lookup | null>(null);
  const [name, setName] = useState("");
  const [table, setTable] = useState<number | null>(null);
  // Tables named after their stakeholder ("Dutch Government 1"). Null when the
  // database does not offer names yet; then the plain number buttons are shown.
  const [named, setNamed] = useState<NamedTable[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resume, setResume] = useState<{ code: string; title: string; table: string } | null>(null);

  // Returning participant on this device? Offer to continue.
  useEffect(() => {
    (async () => {
      const { data } = await db.auth.getSession();
      if (!data.session) return;
      const { data: rows } = await db.from("participants").select("table_number, workshops(access_code,title,status)").order("joined_at", { ascending: false }).limit(1);
      const r = rows?.[0] as unknown as { table_number: number; workshops: { access_code: string; title: string; status: string } } | undefined;
      if (!r || !r.workshops || r.workshops.status === "ended") return;
      const { data: ts } = await db.rpc("workshop_tables", { p_code: r.workshops.access_code });
      const t = (ts as NamedTable[] | null)?.find((x) => x.table_number === r.table_number);
      setResume({ code: r.workshops.access_code, title: r.workshops.title, table: t ? tableLabel(t) : `Table ${r.table_number}` });
    })();
  }, [db]);

  async function lookup(c = code) {
    setErr(null);
    if (c.trim().length < 4) { setErr("Please enter the workshop code shown on the screen."); return; }
    setBusy(true);
    const [{ data, error }, names] = await Promise.all([
      db.rpc("workshop_lookup", { p_code: c }),
      db.rpc("workshop_tables", { p_code: c }),
    ]);
    setBusy(false);
    setNamed(names.error || !(names.data as NamedTable[] | null)?.length ? null : (names.data as NamedTable[]));
    if (error) return setErr(friendlyError(error));
    const row = (data as Lookup[])?.[0];
    if (!row) return setErr(friendlyError("WORKSHOP_NOT_FOUND"));
    if (row.status === "ended") return setErr(friendlyError("WORKSHOP_ENDED"));
    setInfo(row);
  }

  useEffect(() => {
    if (params.get("code")) lookup(params.get("code")!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function join() {
    if (!table) { setErr("Please choose your table."); return; }
    setBusy(true); setErr(null);
    try {
      const { data: s } = await db.auth.getSession();
      if (!s.session) {
        const { error } = await db.auth.signInAnonymously();
        if (error) throw error;
      }
      const { error } = await db.rpc("join_workshop", { p_code: code, p_table: table, p_name: name || null });
      if (error) throw error;
      router.push(`/w/${code.toUpperCase()}`);
    } catch (e) {
      setErr(friendlyError(e));
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-ink">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60" style={{ background: "radial-gradient(60rem 30rem at 110% -10%, rgba(18,163,196,.35), transparent 60%), radial-gradient(40rem 30rem at -20% 110%, rgba(11,92,173,.5), transparent 60%)" }} />
      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-8">
        <header className="flex items-center gap-3 text-white">
          <BrandMark className="h-10 w-10" />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[.14em] text-white/60">Afrikadag workshop</p>
            <p className="font-display text-sm font-semibold">Labour migration · Kenya ⇄ Netherlands</p>
          </div>
        </header>

        <div className="mt-10 text-white">
          <h1 className="break-words font-display text-[2rem] font-extrabold leading-tight text-white">{info ? info.title : "Join the workshop"}</h1>
          <p className="mt-2 text-white/70">{info ? "Two quick steps, then you're in." : "Enter the code shown on the presentation screen."}</p>
        </div>

        {!isConfigured && <p className="mt-6 rounded-xl bg-stop px-4 py-3 text-sm text-white">The platform is not configured yet (missing Supabase settings).</p>}

        {resume && !info && (
          <button onClick={() => router.push(`/w/${resume.code}`)} className="mt-6 flex items-center justify-between gap-3 rounded-2xl bg-white/10 px-4 py-3 text-left text-white ring-1 ring-white/20 transition hover:bg-white/15">
            <span className="min-w-0"><span className="block text-sm font-semibold">Continue where you left off</span><span className="block break-words text-sm text-white/70">{resume.title} · {resume.table}</span></span>
            <ArrowRight className="h-5 w-5" />
          </button>
        )}

        <div className="card mt-6 animate-rise p-5">
          {!info ? (
            <form onSubmit={(e) => { e.preventDefault(); lookup(); }} className="space-y-4">
              <div>
                <label htmlFor="code" className="label">Workshop code</label>
                <input id="code" className="input text-center font-mono text-2xl tracking-[.3em] uppercase" autoComplete="off" autoCapitalize="characters" inputMode="text"
                  maxLength={10} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="CODE" />
              </div>
              <button className="btn-primary w-full !py-3.5 text-base" disabled={busy}>{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Continue <ArrowRight className="h-5 w-5" /></>}</button>
            </form>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); join(); }} className="space-y-5">
              {named ? (
                <div>
                  <label htmlFor="table" className="label">1 · Your table</label>
                  <p className="-mt-1 mb-2 text-sm text-muted">Pick the name on the sign at your table. It decides your stakeholder role.</p>
                  <select id="table" className="input text-base" value={table ?? ""} onChange={(e) => setTable(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">Choose your table…</option>
                    {[...new Set(named.map((t) => t.group_name))].map((gname) => (
                      <optgroup key={gname} label={gname}>
                        {named.filter((t) => t.group_name === gname).map((t) => <option key={t.table_number} value={t.table_number}>{tableLabel(t)}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  {(() => {
                    const t = named.find((x) => x.table_number === table);
                    return t ? (
                      <p className="mt-2 flex min-w-0 items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm text-ink">
                        <GroupBadge name={t.group_name} color={t.group_color} icon={t.group_icon} size="sm" />
                        <span className="min-w-0 break-words">You're joining <strong>{tableLabel(t)}</strong></span>
                      </p>
                    ) : null;
                  })()}
                </div>
              ) : (
                <div>
                  <p className="label">1 · Your table number</p>
                  <p className="-mt-1 mb-2 text-sm text-muted">You'll find it on your table. Your table decides your stakeholder role.</p>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                    {info.tables.map((t) => (
                      <button type="button" key={t} onClick={() => setTable(t)} aria-pressed={table === t}
                        className={`h-12 rounded-xl text-lg font-bold transition ${table === t ? "bg-brand text-white shadow-md ring-4 ring-brand/20" : "bg-surface text-ink hover:bg-brand-soft"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {info.ask_names && (
                <div>
                  <label htmlFor="name" className="label">2 · Your first name <span className="font-normal text-muted">(optional)</span></label>
                  <input id="name" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amina" autoComplete="given-name" />
                  <p className="mt-1.5 text-xs text-muted">Only shown to your own table and the facilitators.</p>
                </div>
              )}
              <button className="btn-primary w-full !py-3.5 text-base" disabled={busy || !table}>{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Join workshop <ArrowRight className="h-5 w-5" /></>}</button>
              <button type="button" className="w-full text-center text-sm text-muted underline-offset-2 hover:underline" onClick={() => { setInfo(null); setTable(null); setNamed(null); }}>Use a different code</button>
            </form>
          )}
          {err && <p className="mt-4 rounded-xl bg-stop-soft px-3.5 py-2.5 text-sm font-medium text-stop" role="alert">{err}</p>}
        </div>

        <p className="mt-auto flex items-center justify-center gap-2 pt-10 text-xs text-white/55">
          <ShieldCheck className="h-4 w-4 shrink-0" /> No account needed. We only store your table and optional first name.
        </p>
      </div>
    </main>
  );
}

export default function JoinPage() {
  return <Suspense><JoinInner /></Suspense>;
}
