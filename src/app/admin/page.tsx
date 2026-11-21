"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, LogOut, Plus } from "lucide-react";
import { adminDb, friendlyError } from "@/lib/supabase";
import { useAdmin } from "@/components/admin/AdminGate";
import { BrandMark } from "@/components/ui/Brand";
import { useToast } from "@/components/ui/Toast";
import { createWorkshop, TEMPLATE_GROUPS } from "@/lib/createWorkshop";
import type { Workshop } from "@/lib/types";

const STATUS: Record<string, string> = { draft: "Not started", live: "Live", paused: "Paused", ended: "Ended" };

export default function AdminHome() {
  const db = adminDb();
  const toast = useToast();
  const { session, signOut } = useAdmin();
  const [list, setList] = useState<Workshop[] | null>(null);
  const [title, setTitle] = useState("Rethinking labour migration: Kenya ⇄ Netherlands");
  const [code, setCode] = useState("");
  const [perGroup, setPerGroup] = useState(2);
  // "" = built-in template, otherwise the id of the workshop whose stakeholders are copied
  const [source, setSource] = useState<string | null>(null);
  const [groupCounts, setGroupCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data }, { data: gs }] = await Promise.all([
      db.from("workshops").select("*").order("created_at", { ascending: false }),
      db.from("stakeholder_groups").select("workshop_id"),
    ]);
    const ws = (data ?? []) as Workshop[];
    const counts: Record<string, number> = {};
    for (const g of gs ?? []) counts[g.workshop_id] = (counts[g.workshop_id] ?? 0) + 1;
    setList(ws);
    setGroupCounts(counts);
    // Default to the stakeholders of AFRIKA24, else the most recent workshop that has any
    setSource((cur) => cur ?? (ws.find((w) => w.access_code === "AFRIKA24" && counts[w.id]) ?? ws.find((w) => counts[w.id]))?.id ?? "");
  };
  const sources = (list ?? []).filter((w) => groupCounts[w.id]);
  const stakeholderCount = source ? groupCounts[source] ?? 0 : TEMPLATE_GROUPS;
  useEffect(() => {
    load();
    setCode("AFRIKA" + Math.floor(10 + Math.random() * 89));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { id: data, error } = await createWorkshop(db, { title, code, tablesPerGroup: perGroup, sourceWorkshopId: source || null });
    setBusy(false);
    if (error) return toast("Could not create workshop", error.message.includes("duplicate") ? "That access code is already in use." : error.message.includes("check") ? "Use 4–10 letters or digits for the code." : friendlyError(error), "warn");
    location.href = `/admin/w/${data}`;
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-4">
          <BrandMark className="h-9 w-9" />
          <div className="flex-1"><p className="eyebrow">Facilitator</p><h1 className="text-lg font-extrabold">Afrikadag workshops</h1></div>
          <span className="hidden text-sm text-muted sm:inline">{session?.user.email}</span>
          <button className="btn-ghost" onClick={signOut}><LogOut className="h-4 w-4" /> Sign out</button>
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl gap-6 px-5 py-8 lg:grid-cols-[1fr_360px]">
        <section>
          <h2 className="mb-3 text-base font-bold">Your workshops</h2>
          {!list ? <Loader2 className="h-5 w-5 animate-spin text-brand" /> : list.length === 0 ? (
            <p className="card p-6 text-sm text-muted">No workshops yet. Create one with the Afrikadag template on the right.</p>
          ) : (
            <ul className="space-y-2">
              {list.map((w) => (
                <li key={w.id}>
                  <Link href={`/admin/w/${w.id}`} className="card flex items-center gap-4 p-4 transition hover:shadow-md">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-ink">{w.title}</p>
                      <p className="text-sm text-muted">Code <span className="font-mono font-semibold text-ink">{w.access_code}</span> · created {new Date(w.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className={`chip ${w.status === "live" ? "bg-go-soft text-go" : w.status === "paused" ? "bg-caution-soft text-caution" : "bg-surface text-muted"}`}>{STATUS[w.status]}</span>
                    <ArrowRight className="h-4 w-4 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <form onSubmit={create} className="card h-fit space-y-4 p-5">
          <div><h2 className="text-base font-bold">New workshop</h2><p className="text-sm text-muted">Pre-filled with the 6 stages, the stakeholder profiles and their guiding questions. Everything is editable afterwards.</p></div>
          <div><label className="label">Title</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
          <div><label className="label">Access code</label><input className="input font-mono uppercase tracking-widest" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} minLength={4} maxLength={10} required /></div>
          <div>
            <label className="label" htmlFor="stakeholders">Stakeholders</label>
            <select id="stakeholders" className="input" value={source ?? ""} onChange={(e) => setSource(e.target.value)}>
              {sources.map((w) => <option key={w.id} value={w.id}>Same as {w.access_code}: {w.title} ({groupCounts[w.id]} stakeholders)</option>)}
              <option value="">Afrikadag template ({TEMPLATE_GROUPS} stakeholders)</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="per-group">Tables per stakeholder</label>
            <select id="per-group" className="input" value={perGroup} onChange={(e) => setPerGroup(Number(e.target.value))}>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <p className="mt-1 text-xs text-muted">{stakeholderCount} stakeholders × {perGroup} = <strong className="text-ink">{stakeholderCount * perGroup} tables</strong>. Adding a stakeholder later adds a table for it. You can change which table has which stakeholder in Setup.</p>
          </div>
          <button className="btn-primary w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create workshop</button>
        </form>
      </main>
    </div>
  );
}
