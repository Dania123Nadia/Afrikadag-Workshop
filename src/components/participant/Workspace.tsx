"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Eye, Loader2, Lock, MessageSquareQuote, Send, Sparkles } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ITEM_META, LEVEL_LABEL } from "@/lib/content";
import { friendlyError } from "@/lib/supabase";
import { serverNow, timeAgo } from "@/lib/time";
import type { ParticipantState } from "@/lib/useParticipantWorkshop";
import type { ItemKind, ResponseItem } from "@/lib/types";
import { ItemBoard } from "./ItemBoard";
import { ReflectionBox } from "./Reflection";
import { SharedText } from "./SharedText";
import { useToast } from "@/components/ui/Toast";

function Section({ n, title, hint, children, accent, required }: { n: number; title: string; hint?: string; children: React.ReactNode; accent?: string; required?: boolean }) {
  return (
    <section className="card animate-rise p-4 sm:p-5">
      <header className="mb-3 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: accent ?? "var(--color-ink)" }}>{n}</span>
        <div>
          <h3 className="text-base font-bold leading-snug">{title}{required && <span className="ml-2 align-middle text-[11px] font-semibold uppercase tracking-wide text-stop">required</span>}</h3>
          {hint && <p className="text-sm text-muted">{hint}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

export function Workspace({ db, data, setItems, focusSubmit, markActive }: {
  db: SupabaseClient; data: ParticipantState; focusSubmit: boolean;
  setItems: (fn: (items: ResponseItem[]) => ResponseItem[]) => void; markActive: () => void;
}) {
  const toast = useToast();
  const { workshop, me, questions, fields, items, reflections, progress } = data;
  const locked = workshop.submissions_locked || workshop.status === "ended" || workshop.status === "draft";
  // "Someone else is editing" is derived from the latest saved version of a field,
  // so it costs no extra realtime messages.
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 2000); return () => clearInterval(t); }, []);
  const othersEditing = (f: "notes" | "key_takeaway") => {
    const row = fields[f];
    return row?.updated_by && row.updated_by !== me.id && serverNow() - new Date(row.updated_at).getTime() < 6000 ? 1 : 0;
  };
  const [submitting, setSubmitting] = useState(false);
  const [takeawayState, setTakeawayState] = useState("saved");

  const onTyping = () => markActive();
  const onErr = (m: string) => toast(m, undefined, "warn");

  async function submit() {
    if (!fields.key_takeaway?.content.trim() && takeawayState === "saved") { toast("Key takeaway missing", friendlyError("KEY_TAKEAWAY_REQUIRED"), "warn"); return; }
    setSubmitting(true);
    // give a pending autosave a moment to land
    await new Promise((r) => setTimeout(r, takeawayState === "saved" ? 0 : 1200));
    const { error } = await db.rpc("submit_group", { p_group: me.group_id });
    setSubmitting(false);
    if (error) return toast("Not submitted", friendlyError(error), "warn");
    toast("Submitted!", "Your group's contribution is saved and visible to the facilitators.", "success");
  }

  const submitted = progress?.status === "submitted";
  const kinds: ItemKind[] = ["opportunity", "risk", "recommendation"];

  const takeaway = (
    <Section n={7} title="Key takeaway" required accent="var(--color-accent)" hint="What is the most important insight your group wants to share with the room?">
      <SharedText db={db} groupId={me.group_id} field="key_takeaway" remote={fields.key_takeaway} disabled={locked} rows={3} maxLength={600}
        placeholder="In one or two sentences…" typingCount={othersEditing("key_takeaway")} onTyping={onTyping} onState={setTakeawayState} id="takeaway" />
    </Section>
  );

  const submitPanel = (
    <section className={`card p-4 sm:p-5 ${submitted && !progress?.edited_after_submit ? "border-go/40 bg-go-soft" : ""}`}>
      {submitted ? (
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-go" />
          <div className="flex-1">
            <h3 className="text-base font-bold">Submitted {progress?.submission_count && progress.submission_count > 1 ? `(${progress.submission_count}×)` : ""}</h3>
            <p className="text-sm">By {progress?.submitted_by} · {timeAgo(progress?.submitted_at)}. The facilitators have your group's contribution.</p>
            {progress?.edited_after_submit && <p className="mt-2 rounded-lg bg-caution-soft px-3 py-2 text-sm font-medium text-caution">Your group changed things after submitting. Submit again to update your final contribution.</p>}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <Eye className="h-5 w-5 shrink-0 text-muted" />
          <p className="text-sm"><span className="font-semibold text-ink">Draft, not submitted yet.</span> Everything saves automatically and facilitators can follow your draft live. When your group agrees, one person submits for the whole table.</p>
        </div>
      )}
      {locked ? (
        <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-caution"><Lock className="h-4 w-4" /> {workshop.status === "draft" ? "The workshop hasn't started yet." : "Submissions are locked by the facilitator."}</p>
      ) : (
        (!submitted || progress?.edited_after_submit) && (
          <button className="btn-primary mt-4 w-full !py-3.5 text-base" onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            {submitted ? "Update our submission" : "Submit our group's contribution"}
          </button>
        )
      )}
    </section>
  );

  return (
    <div className="space-y-3">
      {focusSubmit && (<>{takeaway}{submitPanel}<p className="eyebrow pt-3">Review your group's work</p></>)}
      <Section n={1} title="Your first reaction" hint="A quick personal reaction to the proposal, before you discuss.">
        <ReflectionBox db={db} workshopId={workshop.id} meId={me.id} reflections={reflections} disabled={locked} onTyping={markActive} />
      </Section>
      <Section n={2} title="Guiding questions" hint="Use these to structure your discussion. You don't need to answer them one by one.">
        <ol className="space-y-2">
          {questions.map((q, i) => (
            <li key={q.id} className="flex gap-3 rounded-xl bg-surface p-3">
              <MessageSquareQuote className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand" />
              <div>
                <p className="text-[15px] font-medium text-ink">{q.text}</p>
                <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Q{i + 1} · {LEVEL_LABEL[q.level]}</p>
              </div>
            </li>
          ))}
          {questions.length === 0 && <li className="text-sm text-muted">No questions for this group.</li>}
        </ol>
      </Section>
      <Section n={3} title="Group discussion notes" hint="One shared notepad for your table. Several people can type at once.">
        <SharedText db={db} groupId={me.group_id} field="notes" remote={fields.notes} disabled={locked} rows={7}
          placeholder="Key points from your discussion…" typingCount={othersEditing("notes")} onTyping={onTyping} />
      </Section>
      {kinds.map((k, i) => (
        <Section key={k} n={4 + i} title={ITEM_META[k].label} hint={ITEM_META[k].prompt} accent={ITEM_META[k].color}>
          <ItemBoard db={db} kind={k} items={items} groupId={me.group_id} meId={me.id} disabled={locked} onChange={setItems} onError={onErr} />
        </Section>
      ))}
      {!focusSubmit && (<>{takeaway}{submitPanel}</>)}
      <p className="flex items-center justify-center gap-1.5 pt-2 text-center text-xs text-muted"><Sparkles className="h-3.5 w-3.5" /> Facilitators see your draft as you work. Only the facilitators and your table can see your workspace.</p>
    </div>
  );
}
