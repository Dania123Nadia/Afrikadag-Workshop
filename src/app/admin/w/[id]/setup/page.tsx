"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save, ShieldAlert, Trash2 } from "lucide-react";
import { useWs } from "@/components/admin/WorkshopContext";
import { GROUP_ICONS, GroupBadge } from "@/components/ui/GroupIcon";
import { useToast } from "@/components/ui/Toast";
import { DEFAULT_CONTENT } from "@/lib/content";
import type { Question, Stage, StakeholderGroup, WorkshopContent } from "@/lib/types";

function useSaver() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok = "Saved") => {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) toast("Could not save", error.message, "warn"); else toast(ok, undefined, "success");
    return !error;
  };
  return { busy, run };
}

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="text-base font-bold">{title}</h2>
      {desc && <p className="mt-0.5 text-sm text-muted">{desc}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function Setup() {
  const { workshop: w, stages, groups, loading } = useWs();
  if (loading || !w) return <p className="text-muted">Loading…</p>;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Settings />
      <Tables />
      <Card title="Stakeholder groups" desc="Profiles and guiding questions shown to each group. Keep profiles illustrative unless you have verified sources.">
        <div className="space-y-4">
          {groups.map((g) => <GroupEditor key={g.id} group={g} />)}
          <AddGroup />
        </div>
      </Card>
      <Card title="Stages" desc="Titles, instructions and planned duration. The timer uses the duration when a stage starts.">
        <div className="space-y-3">{stages.map((s) => <StageEditor key={s.id} stage={s} />)}</div>
      </Card>
      <ContentEditor />
      <Danger />
    </div>
  );
}

function Settings() {
  const { db, workshop: w } = useWs();
  const { busy, run } = useSaver();
  const [v, setV] = useState({ title: w!.title, subtitle: w!.subtitle ?? "", access_code: w!.access_code, ask_names: w!.ask_names, max_participants: w!.max_participants });
  return (
    <Card title="Workshop settings">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label">Title</label><input className="input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></div>
        <div className="sm:col-span-2"><label className="label">Subtitle</label><input className="input" value={v.subtitle} onChange={(e) => setV({ ...v, subtitle: e.target.value })} /></div>
        <div><label className="label">Access code</label><input className="input font-mono uppercase tracking-widest" value={v.access_code} maxLength={10} onChange={(e) => setV({ ...v, access_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} /></div>
        <div><label className="label">Max participants</label><input type="number" className="input" min={1} max={500} value={v.max_participants} onChange={(e) => setV({ ...v, max_participants: Number(e.target.value) })} /></div>
        <label className="flex items-center gap-3 sm:col-span-2">
          <input type="checkbox" className="h-5 w-5 accent-[var(--color-brand)]" checked={v.ask_names} onChange={(e) => setV({ ...v, ask_names: e.target.checked })} />
          <span className="text-sm"><span className="font-semibold text-ink">Ask for an optional first name.</span> Turn off for fully anonymous participation.</span>
        </label>
      </div>
      <button className="btn-primary mt-4" disabled={busy} onClick={() => run(() => db.from("workshops").update(v).eq("id", w!.id))}><Save className="h-4 w-4" />Save settings</button>
    </Card>
  );
}

function Tables() {
  const { db, workshop: w, groups, assignments, participants } = useWs();
  const toast = useToast();
  const [newTable, setNewTable] = useState("");
  const setGroup = async (table: number, group_id: string) => {
    const { error } = await db.from("group_assignments").update({ group_id }).eq("workshop_id", w!.id).eq("table_number", table);
    if (error) toast("Could not save", error.message, "warn");
  };
  const add = async () => {
    const n = Number(newTable);
    if (!n || !groups[0]) return;
    const { error } = await db.from("group_assignments").insert({ workshop_id: w!.id, table_number: n, group_id: groups[0].id });
    if (error) toast("Could not add table", error.message.includes("duplicate") ? "That table exists already." : error.message, "warn"); else setNewTable("");
  };
  const remove = async (n: number) => {
    if (participants.some((p) => p.table_number === n)) { toast("Table in use", "Participants have already joined this table.", "warn"); return; }
    await db.from("group_assignments").delete().eq("workshop_id", w!.id).eq("table_number", n);
  };
  return (
    <Card title="Tables → stakeholder groups" desc="Participants pick their table number and are allocated automatically. Several tables can share one stakeholder.">
      <div className="grid gap-2 sm:grid-cols-2">
        {assignments.map((a) => {
          const g = groups.find((x) => x.id === a.group_id);
          const n = participants.filter((p) => p.table_number === a.table_number).length;
          return (
            <div key={a.table_number} className="flex items-center gap-2 rounded-xl bg-surface p-2">
              <span className="flex h-9 w-12 items-center justify-center rounded-lg bg-white font-bold text-ink ring-1 ring-line">{a.table_number}</span>
              {g && <GroupBadge name={g.name} color={g.color} icon={g.icon} size="sm" />}
              <select className="input !py-1.5 text-sm" value={a.group_id} onChange={(e) => setGroup(a.table_number, e.target.value)}>
                {groups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <span className="w-14 shrink-0 text-right text-xs text-muted">{n} joined</span>
              <button className="rounded-lg p-1.5 text-muted hover:text-stop" onClick={() => remove(a.table_number)} aria-label={`Remove table ${a.table_number}`}><Trash2 className="h-4 w-4" /></button>
            </div>
          );
        })}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input className="input w-32" type="number" min={1} max={999} placeholder="Table no." value={newTable} onChange={(e) => setNewTable(e.target.value)} />
        <button className="btn-secondary"><Plus className="h-4 w-4" />Add table</button>
      </form>
      <p className="mt-2 text-xs text-muted">Moving a table to another group moves its participants immediately (their screens update by themselves).</p>
    </Card>
  );
}

function GroupEditor({ group }: { group: StakeholderGroup }) {
  const { db, questions, assignments } = useWs();
  const { busy, run } = useSaver();
  const toast = useToast();
  const [v, setV] = useState(group);
  useEffect(() => setV(group), [group]);
  const qs = questions.filter((q) => q.group_id === group.id);
  const save = () => run(() => db.from("stakeholder_groups").update({ name: v.name, color: v.color, icon: v.icon, who: v.who, interests: v.interests, concerns: v.concerns, illustrative: v.illustrative }).eq("id", group.id));
  const del = async () => {
    if (assignments.some((a) => a.group_id === group.id)) { toast("Group still has tables", "Move its tables to another group first.", "warn"); return; }
    if (!confirm(`Delete "${group.name}" and all its content?`)) return;
    await db.from("stakeholder_groups").delete().eq("id", group.id);
  };
  return (
    <details className="group rounded-2xl ring-1 ring-line open:bg-surface/50">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-3">
        <GroupBadge name={v.name} color={v.color} icon={v.icon} />
        <span className="flex-1 font-bold text-ink">{group.name}</span>
        <span className="text-xs text-muted">{qs.length} questions</span>
      </summary>
      <div className="space-y-3 px-3 pb-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div><label className="label">Name</label><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
          <div><label className="label">Colour</label><input type="color" className="h-[46px] w-16 rounded-xl border border-line bg-white p-1" value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} /></div>
          <div><label className="label">Icon</label>
            <select className="input" value={v.icon} onChange={(e) => setV({ ...v, icon: e.target.value })}>{Object.keys(GROUP_ICONS).map((k) => <option key={k}>{k}</option>)}</select>
          </div>
        </div>
        <div><label className="label">Who they are & their role</label><textarea className="input" rows={3} value={v.who} onChange={(e) => setV({ ...v, who: e.target.value })} /></div>
        <div><label className="label">Main interests and objectives</label><textarea className="input" rows={2} value={v.interests} onChange={(e) => setV({ ...v, interests: e.target.value })} /></div>
        <div><label className="label">Potential concerns about the model</label><textarea className="input" rows={2} value={v.concerns} onChange={(e) => setV({ ...v, concerns: e.target.value })} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={v.illustrative} onChange={(e) => setV({ ...v, illustrative: e.target.checked })} />Show &quot;illustrative profile&quot; disclaimer</label>
        <div className="flex gap-2">
          <button className="btn-primary" disabled={busy} onClick={save}><Save className="h-4 w-4" />Save profile</button>
          <button className="btn-ghost text-stop" onClick={del}><Trash2 className="h-4 w-4" />Delete group</button>
        </div>
        <div className="border-t border-line pt-3">
          <p className="label">Guiding questions</p>
          <div className="space-y-2">{qs.map((q) => <QuestionRow key={q.id} q={q} />)}</div>
          <button className="btn-secondary mt-2" onClick={() => db.from("guiding_questions").insert({ group_id: group.id, position: qs.length, text: "New question", level: "core" })}><Plus className="h-4 w-4" />Add question</button>
        </div>
      </div>
    </details>
  );
}

function QuestionRow({ q }: { q: Question }) {
  const { db } = useWs();
  const [text, setText] = useState(q.text);
  const [level, setLevel] = useState(q.level);
  useEffect(() => { setText(q.text); setLevel(q.level); }, [q]);
  const dirty = text !== q.text || level !== q.level;
  return (
    <div className="flex gap-2">
      <input className="input !py-2 text-sm" value={text} onChange={(e) => setText(e.target.value)} />
      <select className="input !w-32 !py-2 text-sm" value={level} onChange={(e) => setLevel(e.target.value as Question["level"])}>
        <option value="core">Starter</option><option value="deeper">Deeper</option><option value="challenge">Challenge</option>
      </select>
      <button className="btn-primary !px-3" disabled={!dirty} onClick={() => db.from("guiding_questions").update({ text, level }).eq("id", q.id)} aria-label="Save question"><Save className="h-4 w-4" /></button>
      <button className="btn-ghost !px-2 text-muted hover:text-stop" onClick={() => db.from("guiding_questions").delete().eq("id", q.id)} aria-label="Delete question"><Trash2 className="h-4 w-4" /></button>
    </div>
  );
}

function AddGroup() {
  const { db, workshop: w, groups } = useWs();
  return (
    <button className="btn-secondary" onClick={() => db.from("stakeholder_groups").insert({ workshop_id: w!.id, position: groups.length, name: "New stakeholder", who: "", interests: "", concerns: "" })}>
      <Plus className="h-4 w-4" />Add stakeholder group
    </button>
  );
}

function StageEditor({ stage }: { stage: Stage }) {
  const { db } = useWs();
  const { busy, run } = useSaver();
  const [v, setV] = useState(stage);
  useEffect(() => setV(stage), [stage]);
  const dirty = v.title !== stage.title || v.instructions !== stage.instructions || v.duration_minutes !== stage.duration_minutes;
  return (
    <div className="grid gap-2 rounded-xl bg-surface p-3 sm:grid-cols-[2rem_1fr_6rem_auto]">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">{stage.position + 1}</span>
      <div className="space-y-2">
        <input className="input !py-2 font-semibold" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
        <textarea className="input !py-2 text-sm" rows={2} value={v.instructions} onChange={(e) => setV({ ...v, instructions: e.target.value })} />
      </div>
      <div><input type="number" className="input !py-2" min={0} max={600} value={v.duration_minutes} onChange={(e) => setV({ ...v, duration_minutes: Number(e.target.value) })} /><p className="mt-1 text-center text-xs text-muted">minutes</p></div>
      <button className="btn-primary h-fit" disabled={!dirty || busy} onClick={() => run(() => db.from("workshop_stages").update({ title: v.title, instructions: v.instructions, duration_minutes: v.duration_minutes }).eq("id", stage.id))}><Save className="h-4 w-4" /></button>
    </div>
  );
}

function ContentEditor() {
  const { db, workshop: w } = useWs();
  const { busy, run } = useSaver();
  const [v, setV] = useState<WorkshopContent>({ ...DEFAULT_CONTENT, ...(w!.content ?? {}) });
  const fields: [keyof WorkshopContent, string, number][] = [
    ["challenge", "The challenge (stage 1)", 4], ["circular", "A · Circular migration", 3], ["traffic", "B · Traffic light system", 2], ["cotraining", "C · Co-training", 4],
    ["green_examples", "Green: example sectors (optional, only use verified examples)", 1], ["amber_examples", "Amber: example sectors (optional)", 1], ["red_examples", "Red: example sectors (optional)", 1],
  ];
  return (
    <Card title="Introduction content" desc="Texts participants see in stages 1 and 2 and in the Proposal reference.">
      <div className="space-y-3">
        {fields.map(([k, l, rows]) => (
          <div key={k}><label className="label">{l}</label><textarea className="input text-sm" rows={rows} value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>
        ))}
      </div>
      <button className="btn-primary mt-4" disabled={busy} onClick={() => run(() => db.from("workshops").update({ content: v }).eq("id", w!.id))}><Save className="h-4 w-4" />Save content</button>
    </Card>
  );
}

function Danger() {
  const { db, workshop: w, participants } = useWs();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const purge = async () => {
    if (prompt(`This permanently deletes all ${participants.length} participants and everything they wrote. Type DELETE to confirm.`) !== "DELETE") return;
    setBusy(true);
    const { error } = await db.rpc("admin_purge_participant_data", { p_workshop: w!.id });
    setBusy(false);
    if (error) toast("Failed", error.message, "warn"); else toast("Participant data deleted", "The workshop setup is kept.", "success");
  };
  const del = async () => {
    if (prompt(`Delete the entire workshop "${w!.title}" including setup and results? Type DELETE to confirm.`) !== "DELETE") return;
    setBusy(true);
    const { error } = await db.rpc("admin_delete_workshop", { p_workshop: w!.id });
    setBusy(false);
    if (error) toast("Failed", error.message, "warn"); else router.push("/admin");
  };
  return (
    <section className="card border-stop/30 p-5">
      <h2 className="flex items-center gap-2 text-base font-bold text-stop"><ShieldAlert className="h-5 w-5" />Privacy & data deletion</h2>
      <p className="mt-1 text-sm">After the event, export the results and then delete participant data. This removes participant records, names, all workspace content, submissions and announcements, and the anonymous sessions used to join.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-danger" disabled={busy} onClick={purge}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Delete participant data</button>
        <button className="btn-secondary !text-stop" disabled={busy} onClick={del}><Trash2 className="h-4 w-4" />Delete whole workshop</button>
      </div>
    </section>
  );
}
