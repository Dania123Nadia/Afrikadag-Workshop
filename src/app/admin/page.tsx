"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, LogOut, Plus } from "lucide-react";
import { adminDb, friendlyError } from "@/lib/supabase";
import { useAdmin } from "@/components/admin/AdminGate";
import { BrandMark } from "@/components/ui/Brand";
import { useToast } from "@/components/ui/Toast";
import type { Workshop } from "@/lib/types";

const STATUS: Record<string, string> = { draft: "Not started", live: "Live", paused: "Paused", ended: "Ended" };

export default function AdminHome() {
  const db = adminDb();
  const toast = useToast();
  const { session, signOut } = useAdmin();
  const [list, setList] = useState<Workshop[] | null>(null);
  const [title, setTitle] = useState("Rethinking labour migration: Kenya ⇄ Netherlands");
  const [code, setCode] = useState("");
  const [tables, setTables] = useState(10);
  const [busy, setBusy] = useState(false);

  const load = async () => { const { data } = await db.from("workshops").select("*").order("created_at", { ascending: false }); setList((data ?? []) as Workshop[]); };
  useEffect(() => {
    load();
    setCode("AFRIKA" + Math.floor(10 + Math.random() * 89));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await db.rpc("admin_create_workshop", { p_title: title, p_code: code, p_tables: tables });
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
          <div><h2 className="text-base font-bold">New workshop</h2><p className="text-sm text-muted">Pre-filled with the 6 stages, 5 illustrative stakeholder profiles and guiding questions. Everything is editable afterwards.</p></div>
          <div><label className="label">Title</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
          <div><label className="label">Access code</label><input className="input font-mono uppercase tracking-widest" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} minLength={4} maxLength={10} required /></div>
          <div><label className="label">Number of tables</label><input className="input" type="number" min={1} max={50} value={tables} onChange={(e) => setTables(Number(e.target.value))} /><p className="mt-1 text-xs text-muted">Tables are spread across the 5 stakeholder groups. You can change the mapping in Setup.</p></div>
          <button className="btn-primary w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create workshop</button>
        </form>
      </main>
    </div>
  );
}
