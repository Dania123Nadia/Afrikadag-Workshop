"use client";
import { useMemo, useState } from "react";
import { CheckCircle2, Clock, Copy, Download, FileJson, Layers, Megaphone, PencilLine, QrCode, Send, Users, Activity, EyeOff, CircleDashed } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useWs } from "@/components/admin/WorkshopContext";
import { ControlPanel } from "@/components/admin/ControlPanel";
import { ItemCurate } from "@/components/admin/ItemCurate";
import { GroupBadge } from "@/components/ui/GroupIcon";
import { Drawer } from "@/components/ui/Drawer";
import { useToast } from "@/components/ui/Toast";
import { ITEM_META } from "@/lib/content";
import { exportCsv, exportJson } from "@/lib/export";
import { fmt, timeAgo, useRemaining } from "@/lib/time";
import type { ItemKind, StakeholderGroup } from "@/lib/types";

export default function Dashboard() {
  const ws = useWs();
  const { workshop: w, stages, groups, assignments, participants, fields, items, progress, connected, working, byGroup, loading } = ws;
  const [open, setOpen] = useState<string | null>(null);
  const rem = useRemaining(w);
  const joinUrl = typeof window !== "undefined" && w ? `${location.origin}/?code=${w.access_code}` : "";

  const groupStats = useMemo(() => groups.map((g) => {
    const prog = progress.find((p) => p.group_id === g.id);
    const gi = items.filter((i) => i.group_id === g.id);
    return {
      g,
      tables: assignments.filter((a) => a.group_id === g.id).map((a) => a.table_number),
      online: byGroup(g.id).length,
      joined: participants.filter((p) => p.group_id === g.id).length,
      prog,
      takeaway: fields.find((f) => f.group_id === g.id && f.field === "key_takeaway")?.content ?? "",
      notes: fields.find((f) => f.group_id === g.id && f.field === "notes")?.content ?? "",
      opp: gi.filter((i) => i.kind === "opportunity"),
      risk: gi.filter((i) => i.kind === "risk"),
      rec: gi.filter((i) => i.kind === "recommendation"),
    };
  }), [groups, progress, items, assignments, byGroup, participants, fields]);

  if (loading || !w) return <p className="text-muted">Loading…</p>;
  const submitted = progress.filter((p) => p.status === "submitted").length;
  const activeGroups = groupStats.filter((s) => s.online > 0).length;

  const stats = [
    { label: "Connected now", value: connected, sub: `${participants.length} joined in total`, icon: Users },
    { label: "Active groups", value: `${activeGroups}/${groups.length}`, sub: "with someone online", icon: Layers },
    { label: "Submitted", value: `${submitted}/${groups.length}`, sub: "group contributions", icon: CheckCircle2 },
    { label: "Working now", value: working, sub: "typed in last 2 min", icon: Activity },
    { label: "Current stage", value: w.status === "draft" ? "–" : `${w.current_stage + 1}/${stages.length}`, sub: w.status === "draft" ? "not started" : stages[w.current_stage]?.title, icon: CircleDashed },
    { label: "Time left", value: w.status === "draft" ? "–" : fmt(rem), sub: w.timer_running ? "running" : "stopped", icon: Clock },
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
          {stats.map((s) => {
            const I = s.icon;
            return (
              <div key={s.label} className="card p-4">
                <div className="flex items-center gap-2 text-muted"><I className="h-4 w-4" /><span className="text-xs font-semibold">{s.label}</span></div>
                <p className="mt-1 font-display text-2xl font-extrabold tabular-nums text-ink">{s.value}</p>
                <p className="truncate text-xs text-muted">{s.sub}</p>
              </div>
            );
          })}
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold">Live group monitoring</h2>
            <p className="text-xs text-muted">Live drafts update as participants type. Click a group to open its full workspace.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {groupStats.map((s) => {
              const st = s.prog?.status === "submitted" ? (s.prog.edited_after_submit ? "edited" : "submitted") : s.opp.length + s.risk.length + s.rec.length + (s.takeaway ? 1 : 0) + (s.notes ? 1 : 0) > 0 ? "drafting" : "empty";
              const badge = {
                submitted: ["Submitted", "bg-go-soft text-go"],
                edited: ["Edited after submit", "bg-caution-soft text-caution"],
                drafting: ["Drafting", "bg-brand-soft text-brand"],
                empty: ["Not started", "bg-surface text-muted"],
              }[st];
              return (
                <button key={s.g.id} onClick={() => setOpen(s.g.id)} className="card flex flex-col p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="flex items-start gap-3">
                    <GroupBadge name={s.g.name} color={s.g.color} icon={s.g.icon} />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold leading-tight text-ink">{s.g.name}</p>
                      <p className="text-xs text-muted">Tables {s.tables.join(", ") || "none"}</p>
                    </div>
                    <span className={`chip shrink-0 ${badge[1]}`}>{badge[0]}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-xs text-muted">
                    <span className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${s.online ? "bg-go" : "bg-slate-300"}`} />{s.online} online · {s.joined} joined</span>
                    <span>{s.prog?.last_activity_at ? `active ${timeAgo(s.prog.last_activity_at)}` : "no activity yet"}</span>
                  </div>
                  <div className="mt-3 rounded-xl bg-surface p-3">
                    <p className="eyebrow">Key insight {s.prog?.status === "submitted" ? "" : "(draft)"}</p>
                    <p className={`mt-1 line-clamp-3 text-sm ${s.takeaway ? "text-ink" : "italic text-muted"}`}>{s.takeaway || "Not written yet"}</p>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {([["opportunity", s.opp], ["risk", s.risk], ["recommendation", s.rec]] as const).map(([k, list]) => (
                      <div key={k} className="min-w-0 rounded-lg px-2 py-1.5" style={{ background: ITEM_META[k].soft }}>
                        <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: ITEM_META[k].color }}>{ITEM_META[k].label.split(" ")[0]} · {list.length}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-ink">{list[list.length - 1]?.text ?? "–"}</p>
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <aside className="space-y-4">
        <ControlPanel />
        <Announcements />
        <section className="card p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Join & export</h2>
          <div className="mt-3 flex items-center gap-3">
            <div className="rounded-xl bg-white p-2 ring-1 ring-line"><QRCodeSVG value={joinUrl || "about:blank"} size={84} /></div>
            <div className="min-w-0 text-sm">
              <p className="font-mono text-xl font-extrabold tracking-widest text-ink">{w.access_code}</p>
              <button className="mt-1 flex items-center gap-1 text-xs font-semibold text-brand" onClick={() => navigator.clipboard.writeText(joinUrl)}><Copy className="h-3.5 w-3.5" />Copy join link</button>
              <a className="mt-1 flex items-center gap-1 text-xs font-semibold text-brand" href={`/admin/w/${w.id}/present?slide=join`}><QrCode className="h-3.5 w-3.5" />Show join screen</a>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button className="btn-secondary" onClick={() => exportCsv(ws.state)}><Download className="h-4 w-4" />CSV</button>
            <button className="btn-secondary" onClick={() => exportJson(ws.state)}><FileJson className="h-4 w-4" />JSON</button>
          </div>
          <p className="mt-2 text-xs text-muted">Exports contain group content only, no participant names.</p>
        </section>
      </aside>

      <GroupDrawer groupId={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function Announcements() {
  const { db, workshop: w, announcements } = useWs();
  const toast = useToast();
  const [msg, setMsg] = useState("");
  if (!w) return null;
  const send = async (m: string) => {
    if (!m.trim()) return;
    await db.from("announcements").update({ active: false }).eq("workshop_id", w.id).eq("active", true);
    const { error } = await db.from("announcements").insert({ workshop_id: w.id, message: m.trim() });
    if (error) return toast("Not sent", error.message, "warn");
    setMsg("");
    toast("Announcement sent", m, "success");
  };
  const quick = ["5 minutes left!", "Please agree on your key takeaway and submit.", "Please return to your seats."];
  return (
    <section className="card p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted"><Megaphone className="h-4 w-4" />Announcement to all</h2>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(msg); }}>
        <input className="input !py-2 text-sm" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Message for every screen…" maxLength={500} />
        <button className="btn-primary !px-3" disabled={!msg.trim()} aria-label="Send"><Send className="h-4 w-4" /></button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">{quick.map((q) => <button key={q} className="chip bg-surface text-ink-2 hover:bg-brand-soft" onClick={() => send(q)}>{q}</button>)}</div>
      {announcements.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {announcements.slice(0, 4).map((a) => (
            <li key={a.id} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${a.active ? "bg-brand-soft text-ink" : "text-muted"}`}>
              <span className="flex-1">{a.message}</span><span>{timeAgo(a.created_at)}</span>
              {a.active && <button title="Hide" onClick={() => db.from("announcements").update({ active: false }).eq("id", a.id)}><EyeOff className="h-3.5 w-3.5" /></button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GroupDrawer({ groupId, onClose }: { groupId: string | null; onClose: () => void }) {
  const { groups, assignments, participants, fields, items, reflections, progress, submissions, questions, byGroup } = useWs();
  const [tab, setTab] = useState<"live" | "submitted" | "people">("live");
  const g = groups.find((x) => x.id === groupId) as StakeholderGroup | undefined;
  if (!g) return null;
  const prog = progress.find((p) => p.group_id === g.id);
  const subs = submissions.filter((s) => s.group_id === g.id);
  const f = (k: string) => fields.find((x) => x.group_id === g.id && x.field === k);
  const online = new Set(byGroup(g.id).map((p) => p.pid));
  const kinds: ItemKind[] = ["opportunity", "risk", "recommendation"];

  return (
    <Drawer open={!!groupId} onClose={onClose} wide title={
      <div className="flex items-center gap-3">
        <GroupBadge name={g.name} color={g.color} icon={g.icon} />
        <div className="min-w-0">
          <p className="truncate font-bold text-ink">{g.name}</p>
          <p className="text-xs text-muted">Tables {assignments.filter((a) => a.group_id === g.id).map((a) => a.table_number).join(", ")} · {prog?.status === "submitted" ? `submitted ${timeAgo(prog.submitted_at)}${prog.edited_after_submit ? ", edited since" : ""}` : "not submitted"}</p>
        </div>
      </div>
    }>
      <div className="mb-4 flex gap-1 rounded-xl bg-white p-1 ring-1 ring-line">
        {([["live", "Live draft"], ["submitted", `Submitted (${subs.length})`], ["people", "Participants"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === k ? "bg-ink text-white" : "text-muted"}`}>{l}</button>
        ))}
      </div>

      {tab === "live" && (
        <div className="space-y-4">
          <p className="flex items-center gap-2 rounded-xl bg-brand-soft px-3 py-2 text-xs font-medium text-brand"><PencilLine className="h-4 w-4" />Live draft: what the group is writing right now, before formal submission.</p>
          <Block title="Key takeaway"><p className={`text-[15px] ${f("key_takeaway")?.content ? "font-semibold text-ink" : "italic text-muted"}`}>{f("key_takeaway")?.content || "Not written yet"}</p></Block>
          <Block title="Discussion notes"><p className="whitespace-pre-wrap text-sm">{f("notes")?.content || <span className="italic text-muted">Empty</span>}</p></Block>
          {kinds.map((k) => (
            <Block key={k} title={`${ITEM_META[k].label} (${items.filter((i) => i.group_id === g.id && i.kind === k).length})`}>
              <div className="space-y-1.5">
                {items.filter((i) => i.group_id === g.id && i.kind === k).map((i) => <ItemCurate key={i.id} item={i} />)}
              </div>
            </Block>
          ))}
          <Block title="First reactions (individual)">
            <div className="space-y-1.5">
              {reflections.filter((r) => r.group_id === g.id && r.text.trim()).map((r) => <p key={r.participant_id} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-line"><span className="font-semibold text-ink">{r.author_label}: </span>{r.text}</p>)}
            </div>
          </Block>
          <Block title="Guiding questions">
            <ol className="list-decimal space-y-1 pl-5 text-sm">{questions.filter((q) => q.group_id === g.id).map((q) => <li key={q.id}>{q.text}</li>)}</ol>
          </Block>
        </div>
      )}

      {tab === "submitted" && (
        <div className="space-y-3">
          {subs.length === 0 && <p className="text-sm text-muted">This group has not submitted yet.</p>}
          {subs.map((s, i) => (
            <div key={s.id} className="card p-4">
              <p className="eyebrow">{i === 0 ? "Latest submission" : "Earlier submission"} · {new Date(s.submitted_at).toLocaleTimeString()} · by {s.submitted_by}</p>
              <p className="mt-2 font-semibold text-ink">{s.snapshot.key_takeaway}</p>
              {(["opportunities", "risks", "recommendations"] as const).map((k) => s.snapshot[k].length > 0 && (
                <div key={k} className="mt-2"><p className="text-xs font-bold uppercase text-muted">{k}</p><ul className="list-disc pl-5 text-sm">{s.snapshot[k].map((t, j) => <li key={j}>{t}</li>)}</ul></div>
              ))}
            </div>
          ))}
        </div>
      )}

      {tab === "people" && (
        <ul className="space-y-1.5">
          {participants.filter((p) => p.group_id === g.id).map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-line">
              <span className={`h-2 w-2 rounded-full ${online.has(p.id) ? "bg-go" : "bg-slate-300"}`} />
              <span className="flex-1 font-medium text-ink">{p.display_name || <span className="text-muted">Anonymous</span>}</span>
              <span className="text-xs text-muted">Table {p.table_number}</span>
              <span className="text-xs text-muted">{online.has(p.id) ? "online" : `seen ${timeAgo(p.last_seen_at)}`}</span>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">{title}</h3>{children}</section>;
}
