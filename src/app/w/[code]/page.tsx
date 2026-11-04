"use client";
import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, ChevronRight, Loader2, Megaphone, Mic, PauseCircle, PartyPopper, Users, WifiOff, X } from "lucide-react";
import { BrandMark } from "@/components/ui/Brand";
import { GroupBadge } from "@/components/ui/GroupIcon";
import { ProgressTracker } from "@/components/ui/ProgressTracker";
import { ProposalOverview, TrafficLight } from "@/components/ui/Proposal";
import { StakeholderCard } from "@/components/ui/StakeholderCard";
import { TimerBadge } from "@/components/ui/TimerBadge";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { Drawer } from "@/components/ui/Drawer";
import { Workspace } from "@/components/participant/Workspace";
import { contentOf } from "@/lib/content";
import { useParticipantWorkshop } from "@/lib/useParticipantWorkshop";
import type { ResponseItem } from "@/lib/types";
import { fmt, useRemaining } from "@/lib/time";

export default function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return <ToastProvider><ParticipantApp code={code} /></ToastProvider>;
}

function ParticipantApp({ code }: { code: string }) {
  const router = useRouter();
  const toast = useToast();
  const { db, status, data, setData, connected, groupOnline, markActive, error } = useParticipantWorkshop(code);
  const [refOpen, setRefOpen] = useState(false);
  const [refTab, setRefTab] = useState<"proposal" | "role">("role");
  const [dismissed, setDismissed] = useState<string | null>(null);
  const prevStage = useRef<number | null>(null);
  const prevStatus = useRef<string | null>(null);
  const prevAnn = useRef<string | null>(null);

  useEffect(() => { if (status === "not-joined") router.replace(`/?code=${encodeURIComponent(code.toUpperCase())}`); }, [status, code, router]);

  // Notify on stage change / pause / announcements
  const w = data?.workshop;
  useEffect(() => {
    if (!w || !data) return;
    const stage = data.stages[w.current_stage];
    if (prevStage.current !== null && (prevStage.current !== w.current_stage || (prevStatus.current === "draft" && w.status === "live"))) {
      toast(`New stage: ${stage?.title ?? ""}`, stage?.instructions, "stage");
      try { navigator.vibrate?.(120); } catch {}
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (prevStatus.current && prevStatus.current !== w.status) {
      if (w.status === "paused") toast("The workshop is paused", "Please wait for the facilitator.", "info");
      if (prevStatus.current === "paused" && w.status === "live") toast("We're back", "The workshop continues.", "info");
    }
    prevStage.current = w.current_stage;
    prevStatus.current = w.status;
  }, [w, data, toast]);

  const latestAnn = data?.announcements.find((a) => a.active);
  useEffect(() => {
    if (!latestAnn) return;
    if (prevAnn.current && prevAnn.current !== latestAnn.id) { toast("Announcement", latestAnn.message, "stage"); try { navigator.vibrate?.([80, 60, 80]); } catch {} }
    prevAnn.current = latestAnn.id;
  }, [latestAnn, toast]);

  const remaining = useRemaining(w ?? null);

  if (status === "loading" || status === "not-joined" || !data || !w) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-surface p-6 text-center">
        {status === "error" ? (<><p className="font-semibold text-ink">We couldn't load the workshop.</p><p className="text-sm text-muted">{error}</p><button className="btn-primary" onClick={() => location.reload()}>Try again</button></>)
          : <Loader2 className="h-7 w-7 animate-spin text-brand" />}
      </main>
    );
  }

  const { stages, groups, me } = data;
  const group = groups.find((g) => g.id === me.group_id);
  const started = w.status !== "draft";
  const stage = stages[w.current_stage];
  const next = stages[w.current_stage + 1];
  const content = contentOf(w.content);
  const roleVisible = started && (stages.findIndex((s) => s.kind === "assignment") <= w.current_stage);
  const setItems = (fn: (items: ResponseItem[]) => ResponseItem[]) => setData((d) => (d ? { ...d, items: fn(d.items) } : d));
  const spotlight = groups.find((g) => g.id === w.spotlight_group_id);

  return (
    <div className="min-h-dvh pb-28">
      {/* Persistent header + progress tracker */}
      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 pb-1 pt-3">
          <BrandMark className="h-8 w-8 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-bold text-ink">{w.title}</p>
            <p className="truncate text-xs text-muted">Table {me.table_number}{roleVisible && group ? ` · ${group.name}` : ""}</p>
          </div>
          {started && w.status !== "ended" && <TimerBadge workshop={w} />}
        </div>
        <div className="mx-auto max-w-3xl px-3 pb-2"><ProgressTracker stages={stages} current={w.current_stage} started={started} /></div>
      </header>

      {!connected && (
        <div className="flex items-center justify-center gap-2 bg-caution-soft px-4 py-2 text-sm font-medium text-caution"><WifiOff className="h-4 w-4" /> Reconnecting… your work is kept on this device.</div>
      )}
      {w.status === "paused" && (
        <div className="flex items-center justify-center gap-2 bg-ink px-4 py-2.5 text-sm font-semibold text-white"><PauseCircle className="h-4 w-4" /> Paused by the facilitator. Please look up.</div>
      )}

      <main className="mx-auto max-w-3xl space-y-4 px-4 pt-4">
        {latestAnn && dismissed !== latestAnn.id && (
          <div className="flex animate-pop items-start gap-3 rounded-2xl bg-brand px-4 py-3 text-white shadow-lg" role="status">
            <Megaphone className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="flex-1 text-[15px] font-medium">{latestAnn.message}</p>
            <button onClick={() => setDismissed(latestAnn.id)} className="rounded-lg p-1 hover:bg-white/15" aria-label="Dismiss"><X className="h-4 w-4" /></button>
          </div>
        )}

        {w.status === "ended" ? (
          <section className="card animate-rise p-6 text-center">
            <PartyPopper className="mx-auto h-10 w-10 text-accent" />
            <h1 className="mt-3 text-2xl font-extrabold">Thank you for taking part!</h1>
            <p className="mt-2">Your group's insights are part of the results of today's workshop.</p>
            {data.fields.key_takeaway?.content && <blockquote className="mx-auto mt-4 max-w-md rounded-2xl bg-surface p-4 text-left text-ink"><span className="eyebrow block">Your group's key takeaway</span>{data.fields.key_takeaway.content}</blockquote>}
          </section>
        ) : !started ? (
          <section className="card animate-rise p-6">
            <p className="eyebrow">You're in</p>
            <h1 className="mt-1 text-2xl font-extrabold">Welcome{me.display_name ? `, ${me.display_name}` : ""}!</h1>
            <p className="mt-2">You're joined at <strong>table {me.table_number}</strong>. The facilitator will start the workshop shortly. This screen updates by itself. You don't need to refresh.</p>
            <div className="mt-5 flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Waiting for the facilitator…</div>
          </section>
        ) : (
          <>
            {/* "Where am I / what now / how long" card */}
            <section className="card animate-rise overflow-hidden" key={stage?.id}>
              <div className="bg-ink px-5 py-4 text-white">
                <p className="text-[11px] font-bold uppercase tracking-[.14em] text-white/60">Step {w.current_stage + 1} of {stages.length}{remaining != null && w.status !== "paused" ? ` · ${fmt(remaining)} left` : ""}</p>
                <h1 className="mt-1 font-display text-2xl font-extrabold text-white">{stage?.title}</h1>
              </div>
              <div className="space-y-3 px-5 py-4">
                <p className="text-[15px] leading-relaxed text-ink">{stage?.instructions}</p>
                {next && <p className="flex items-center gap-1 text-sm text-muted"><ChevronRight className="h-4 w-4" /> Next: {next.title}</p>}
              </div>
            </section>

            {stage?.kind === "intro" && (
              <div className="space-y-4">
                <section className="card animate-rise p-5">
                  <p className="eyebrow">The challenge</p>
                  <p className="mt-2 text-[15px] leading-relaxed">{content.challenge}</p>
                </section>
                <section className="card animate-rise p-5">
                  <p className="eyebrow mb-3">The proposal in one look</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {[["A", "Circular migration", "Work in NL for a period, return, possibly again."], ["B", "Traffic light system", "Only facilitate where both countries benefit."], ["C", "Co-training", "Select and train candidates together."]].map(([l, t, d]) => (
                      <div key={l} className="rounded-xl bg-surface p-3"><span className="text-xs font-bold text-brand">{l}</span><p className="font-bold text-ink">{t}</p><p className="text-sm text-muted">{d}</p></div>
                    ))}
                  </div>
                  <div className="mt-4"><TrafficLight content={w.content} /></div>
                </section>
              </div>
            )}

            {stage?.kind === "proposal" && <ProposalOverview content={w.content} />}

            {stage?.kind === "assignment" && group && (
              <div className="space-y-4">
                <StakeholderCard group={group} reveal />
                <section className="card p-5">
                  <p className="eyebrow">Warm-up at your table</p>
                  <p className="mt-1 text-[15px]">Take a minute to agree: <strong>as {group.name}, what is your first reaction to the proposal?</strong> In the next step you'll write it down.</p>
                </section>
              </div>
            )}

            {(stage?.kind === "discussion" || stage?.kind === "submit") && (
              <>
                {group && (
                  <button onClick={() => { setRefTab("role"); setRefOpen(true); }} className="card flex w-full items-center gap-3 p-3 text-left transition hover:shadow-md">
                    <GroupBadge name={group.name} color={group.color} icon={group.icon} />
                    <span className="min-w-0 flex-1"><span className="eyebrow block">You speak as</span><span className="font-bold text-ink">{group.name}</span></span>
                    <span className="flex items-center gap-1 text-xs text-muted"><Users className="h-4 w-4" />{groupOnline} online</span>
                  </button>
                )}
                <Workspace db={db} data={data} setItems={setItems} focusSubmit={stage.kind === "submit"} markActive={markActive} />
              </>
            )}

            {stage?.kind === "presentation" && (
              <div className="space-y-4">
                {spotlight && (
                  <section className="card flex animate-pop items-center gap-4 p-5">
                    <Mic className="h-6 w-6 text-accent" />
                    <div><p className="eyebrow">Now presenting</p><p className="text-lg font-bold text-ink">{spotlight.name}</p></div>
                  </section>
                )}
                <section className="card p-5">
                  <p className="eyebrow">Your group's key takeaway</p>
                  <p className="mt-2 text-lg font-semibold text-ink">{data.fields.key_takeaway?.content || "Not filled in yet."}</p>
                  <p className="mt-2 text-sm text-muted">{data.progress?.status === "submitted" ? "Submitted ✓" : "Not submitted yet. Ask your table if you still want to submit."}</p>
                </section>
                <section className="card p-5">
                  <p className="eyebrow">While you listen</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px]">
                    <li>Where do other stakeholders see things differently from you?</li>
                    <li>Which risk came up in more than one group?</li>
                    <li>Which recommendation would you adopt from another group?</li>
                  </ul>
                </section>
                {(data.progress?.status !== "submitted" || data.progress?.edited_after_submit) && !w.submissions_locked && (
                  <Workspace db={db} data={data} setItems={setItems} focusSubmit markActive={markActive} />
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Always-available reference: the proposal and your role */}
      {started && w.status !== "ended" && (
        <button onClick={() => { setRefTab(roleVisible ? "role" : "proposal"); setRefOpen(true); }}
          className="fixed bottom-5 right-4 z-30 flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-ink-2">
          <BookOpen className="h-4 w-4" /> Proposal & role
        </button>
      )}
      <Drawer open={refOpen} onClose={() => setRefOpen(false)} title={
        <div className="flex gap-1 rounded-xl bg-surface p-1">
          {(["role", "proposal"] as const).map((t) => (
            <button key={t} onClick={() => setRefTab(t)} disabled={t === "role" && !roleVisible} className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-40 ${refTab === t ? "bg-white text-ink shadow-sm" : "text-muted"}`}>
              {t === "role" ? "My role" : "The proposal"}
            </button>
          ))}
        </div>
      }>
        {refTab === "role" && group && roleVisible ? <StakeholderCard group={group} /> : <ProposalOverview content={w.content} />}
      </Drawer>
    </div>
  );
}
