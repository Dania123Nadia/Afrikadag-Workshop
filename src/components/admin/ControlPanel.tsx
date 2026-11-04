"use client";
import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Flag, Lock, LockOpen, Minus, Pause, Play, Plus, RotateCcw, Square, TimerReset } from "lucide-react";
import { useWs } from "./WorkshopContext";
import { useToast } from "@/components/ui/Toast";
import { friendlyError } from "@/lib/supabase";
import { fmt, useRemaining } from "@/lib/time";

export function ControlPanel() {
  const { workshop: w, stages, control } = useWs();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const rem = useRemaining(w);
  if (!w) return null;

  const run = async (action: string, value?: number, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(action);
    try { await control(action, value); } catch (e) { toast("Action failed", friendlyError(e), "warn"); }
    setBusy(null);
  };
  const started = w.status !== "draft";
  const stage = stages[w.current_stage];

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Workshop controls</h2>
        <span className={`chip ${w.status === "live" ? "bg-go-soft text-go" : w.status === "paused" ? "bg-caution-soft text-caution" : w.status === "ended" ? "bg-surface text-muted" : "bg-brand-soft text-brand"}`}>
          {w.status === "draft" ? "Not started" : w.status === "live" ? "Live" : w.status === "paused" ? "Paused" : "Ended"}
        </span>
      </div>

      {/* Primary action */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {w.status === "draft" || w.status === "ended" ? (
          <button className="btn-primary col-span-2 !py-3" onClick={() => run("start", w.status === "ended" ? w.current_stage : 0)} disabled={!!busy}><Play className="h-4 w-4" />{w.status === "ended" ? "Re-open workshop" : "Start workshop"}</button>
        ) : (
          <>
            <button className="btn-secondary" onClick={() => run("prev")} disabled={!!busy || w.current_stage === 0}><ChevronLeft className="h-4 w-4" />Previous</button>
            <button className="btn-primary" onClick={() => run("next")} disabled={!!busy || w.current_stage >= stages.length - 1}>Next stage<ChevronRight className="h-4 w-4" /></button>
            {w.status === "paused"
              ? <button className="btn-secondary col-span-2 !border-caution/40 !bg-caution-soft !text-caution" onClick={() => run("resume")} disabled={!!busy}><Play className="h-4 w-4" />Resume workshop</button>
              : <button className="btn-secondary col-span-2" onClick={() => run("pause")} disabled={!!busy}><Pause className="h-4 w-4" />Pause workshop</button>}
          </>
        )}
      </div>

      {/* Timer */}
      {started && w.status !== "ended" && (
        <div className="mt-4 rounded-2xl bg-ink p-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[.14em] text-white/60">{stage?.title} · timer</p>
              <p className={`font-display text-4xl font-extrabold tabular-nums ${rem === 0 && w.timer_running ? "text-red-300" : rem != null && rem <= 60 && w.timer_running ? "text-amber-300" : "text-white"}`}>{fmt(rem)}</p>
            </div>
            {w.timer_running
              ? <button className="btn !bg-white/15 !text-white hover:!bg-white/25" onClick={() => run("timer_stop")}><Square className="h-4 w-4" />Stop</button>
              : <button className="btn !bg-white !text-ink" onClick={() => run("timer_start")} disabled={!rem}><Play className="h-4 w-4" />Start</button>}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[[-60, "1 min", Minus], [60, "1 min", Plus], [300, "5 min", Plus]].map(([v, l, I]) => {
              const Icon = I as typeof Plus;
              return <button key={String(v)} className="btn !bg-white/10 !px-3 !py-1.5 !text-xs !text-white hover:!bg-white/20" onClick={() => run("extend", v as number)}><Icon className="h-3 w-3" />{l as string}</button>;
            })}
            <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); const m = Number(custom); if (m >= 0) { run("timer_set", Math.round(m * 60)); setCustom(""); } }}>
              <input className="w-16 rounded-lg bg-white/10 px-2 text-xs text-white placeholder:text-white/40" placeholder="min" inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Set timer minutes" />
              <button className="btn !bg-white/10 !px-2.5 !py-1.5 !text-xs !text-white" title="Set timer"><TimerReset className="h-3.5 w-3.5" />Set</button>
            </form>
          </div>
        </div>
      )}

      {/* Stage list */}
      <ol className="mt-4 space-y-1">
        {stages.map((s, i) => {
          const done = started && i < w.current_stage;
          const now = started && i === w.current_stage;
          return (
            <li key={s.id}>
              <button
                onClick={() => !now && run(started ? "goto" : "start", i, `Move everyone to "${s.title}"?`)}
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition ${now ? "bg-brand-soft font-bold text-brand" : "hover:bg-surface"}`}
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${now ? "bg-brand text-white" : done ? "bg-go text-white" : "border border-line text-muted"}`}>{done ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
                <span className="flex-1 text-ink">{s.title}</span>
                <span className="text-xs text-muted">{s.duration_minutes} min</span>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Submissions + end */}
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4">
        {w.submissions_locked
          ? <button className="btn-secondary !border-caution/40 !text-caution" onClick={() => run("unlock")}><LockOpen className="h-4 w-4" />Reopen input</button>
          : <button className="btn-secondary" onClick={() => run("lock", undefined, "Lock all workspaces? Participants can still read but not edit or submit.")}><Lock className="h-4 w-4" />Lock input</button>}
        {w.status !== "ended"
          ? <button className="btn-secondary" onClick={() => run("end", undefined, "End the workshop for everyone? Participants will see a thank-you screen.")} disabled={!started}><Flag className="h-4 w-4" />End workshop</button>
          : <button className="btn-secondary" onClick={() => run("reset", undefined, "Reset to 'not started'? All content is kept.")}><RotateCcw className="h-4 w-4" />Reset to start</button>}
      </div>
      {w.submissions_locked && <p className="mt-2 text-xs font-medium text-caution">Input is locked: participants can't edit or submit.</p>}
    </section>
  );
}
