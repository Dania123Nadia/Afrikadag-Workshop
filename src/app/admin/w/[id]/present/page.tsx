"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ChevronLeft, ChevronRight, Expand, ListChecks, Pause, Play, RotateCcw, Star, Timer, X } from "lucide-react";
import { useWs } from "@/components/admin/WorkshopContext";
import { ItemCurate } from "@/components/admin/ItemCurate";
import { GroupIcon } from "@/components/ui/GroupIcon";
import { BrandMark } from "@/components/ui/Brand";
import { ProgressTracker } from "@/components/ui/ProgressTracker";
import { TimerBadge } from "@/components/ui/TimerBadge";
import { TrafficLight } from "@/components/ui/Proposal";
import { ITEM_META } from "@/lib/content";
import { contested } from "@/lib/insights";
import type { ItemKind, ResponseItem, StakeholderGroup } from "@/lib/types";

type Slide = { key: string; label: string; group?: StakeholderGroup };

export default function Page() { return <Suspense><Present /></Suspense>; }

function Present() {
  const params = useSearchParams();
  const { db, workshop: w, groups, items, fields, assignments, stages, progress } = useWs();
  const [featuredOnly, setFeaturedOnly] = useState(true);
  const [picker, setPicker] = useState(false);
  const [chrome, setChrome] = useState(true);

  const slides: Slide[] = useMemo(() => [
    { key: "join", label: "Join" },
    { key: "proposal", label: "The proposal" },
    { key: "overview", label: "Stakeholder groups" },
    ...groups.map((g) => ({ key: `group-${g.id}`, label: g.name, group: g })),
    { key: "opportunity", label: "Main opportunities" },
    { key: "risk", label: "Main concerns" },
    { key: "recommendation", label: "Key recommendations" },
    { key: "disagreements", label: "Notable disagreements" },
    { key: "insights", label: "Most interesting insights" },
  ], [groups]);
  const [idx, setIdx] = useState(() => Math.max(0, slides.findIndex((s) => s.key === params.get("slide"))));
  const slide = slides[Math.min(idx, slides.length - 1)];

  const go = useCallback((d: number) => setIdx((i) => Math.max(0, Math.min(slides.length - 1, i + d))), [slides.length]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); go(1); }
      if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1);
      if (e.key === "f") document.documentElement.requestFullscreen?.();
      if (e.key === "h") setChrome((c) => !c);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [go]);

  // Tell participants which group is presenting
  useEffect(() => {
    if (!w) return;
    const gid = slide.group?.id ?? null;
    if (gid !== w.spotlight_group_id) db.rpc("admin_set_spotlight", { p_workshop: w.id, p_group: gid });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide.key, w?.id]);

  if (!w) return <div className="min-h-dvh bg-ink" />;
  const pick = (list: ResponseItem[]) => (featuredOnly ? list.filter((i) => i.featured) : list);
  const joinUrl = typeof window !== "undefined" ? `${location.origin}/?code=${w.access_code}` : "";
  const takeaway = (gid: string) => fields.find((f) => f.group_id === gid && f.field === "key_takeaway")?.content ?? "";
  const pickerItems = slide.group ? items.filter((i) => i.group_id === slide.group!.id) : ["opportunity", "risk", "recommendation"].includes(slide.key) ? items.filter((i) => i.kind === slide.key) : items;

  return (
    <div className="relative flex min-h-dvh flex-col bg-ink text-white" onMouseMove={() => setChrome(true)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-50" style={{ background: "radial-gradient(70rem 40rem at 100% 0%, rgba(18,163,196,.25), transparent 60%), radial-gradient(50rem 40rem at 0% 100%, rgba(11,92,173,.35), transparent 60%)" }} />

      <header className="relative flex items-center gap-4 px-8 pt-6">
        <BrandMark className="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-white/55">{w.title}</p>
          <div className="mt-1 max-w-4xl"><ProgressTracker stages={stages} current={w.current_stage} started={w.status !== "draft"} dark /></div>
        </div>
        {w.status !== "draft" && w.status !== "ended" && <TimerBadge workshop={w} dark />}
      </header>

      <main key={slide.key} className="relative flex flex-1 animate-rise flex-col px-8 pb-28 pt-8 lg:px-16">
        {slide.key === "join" && (
          <div className="m-auto flex flex-col items-center gap-10 text-center lg:flex-row lg:text-left">
            <div className="rounded-3xl bg-white p-6 shadow-2xl"><QRCodeSVG value={joinUrl} size={300} /></div>
            <div>
              <p className="text-xl font-semibold text-white/70">Scan the code or go to</p>
              <p className="mt-1 break-all font-display text-3xl font-bold text-white">{joinUrl.replace(/^https?:\/\//, "").replace(/\?code=.*/, "")}</p>
              <p className="mt-8 text-xl font-semibold text-white/70">Workshop code</p>
              <p className="font-mono text-7xl font-extrabold tracking-[.2em] text-accent">{w.access_code}</p>
              <p className="mt-6 text-lg text-white/70">Then choose your table number. No account needed.</p>
            </div>
          </div>
        )}

        {slide.key === "proposal" && (
          <div className="m-auto w-full max-w-6xl">
            <h1 className="font-display text-5xl font-extrabold text-white">One integrated proposal</h1>
            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              {[["A", "Circular migration", "Work in the Netherlands for a set period, return, and possibly come back."], ["B", "Traffic light system", "Facilitate migration only where labour market needs in both countries justify it."], ["C", "Co-training", "Joint assessment, skills and language training for green and amber sectors."]].map(([l, t, d]) => (
                <div key={l} className="rounded-3xl bg-white/8 p-6 ring-1 ring-white/15"><p className="text-lg font-bold text-accent">{l}</p><p className="mt-1 text-2xl font-bold">{t}</p><p className="mt-2 text-lg text-white/75">{d}</p></div>
              ))}
            </div>
            <div className="mt-6 rounded-3xl bg-white p-5 text-ink"><TrafficLight content={w.content} /></div>
          </div>
        )}

        {slide.key === "overview" && (
          <div className="m-auto w-full max-w-6xl">
            <h1 className="font-display text-5xl font-extrabold text-white">Stakeholder groups</h1>
            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {groups.map((g) => (
                <div key={g.id} className="rounded-3xl bg-white/8 p-6 ring-1 ring-white/15">
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: g.color }}><GroupIcon name={g.icon} className="h-6 w-6 text-white" /></span>
                    <div><p className="text-xl font-bold">{g.name}</p><p className="text-white/60">Tables {assignments.filter((a) => a.group_id === g.id).map((a) => a.table_number).join(", ")}</p></div>
                  </div>
                  <p className="mt-4 line-clamp-3 text-lg text-white/80">{takeaway(g.id) || <span className="italic text-white/40">Key takeaway still to come</span>}</p>
                  {progress.find((p) => p.group_id === g.id)?.status === "submitted" && <p className="mt-3 text-sm font-bold text-emerald-300">✓ Submitted</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {slide.group && <GroupSlide group={slide.group} items={items} pick={pick} takeaway={takeaway(slide.group.id)} tables={assignments.filter((a) => a.group_id === slide.group!.id).map((a) => a.table_number)} />}

        {(["opportunity", "risk", "recommendation"] as const).includes(slide.key as ItemKind) && (
          <CrossSlide title={slide.label} kind={slide.key as ItemKind} list={pick(items.filter((i) => i.kind === slide.key))} groups={groups} featuredOnly={featuredOnly} />
        )}

        {slide.key === "disagreements" && (
          <div className="w-full">
            <h1 className="font-display text-5xl font-extrabold text-white">Notable disagreements</h1>
            <div className="mt-8 grid gap-4 lg:grid-cols-2">
              {contested(items, 4).map((c) => (
                <div key={c.term} className="rounded-3xl bg-white/8 p-6 ring-1 ring-white/15">
                  <p className="text-2xl font-bold capitalize">{c.term}</p>
                  <p className="mt-2 text-lg"><span className="font-bold text-emerald-300">Opportunity for </span>{[...new Set(c.opp.map((i) => groups.find((g) => g.id === i.group_id)?.name))].join(", ")}</p>
                  <p className="text-lg"><span className="font-bold text-red-300">Risk for </span>{[...new Set(c.risk.map((i) => groups.find((g) => g.id === i.group_id)?.name))].join(", ")}</p>
                </div>
              ))}
              {items.filter((i) => i.flag === "disagreement").map((i) => <Quote key={i.id} item={i} groups={groups} />)}
            </div>
            {contested(items, 4).length === 0 && items.every((i) => i.flag !== "disagreement") && <Empty text="Tag items as “disagreement” in the dashboard or Insights to show them here." />}
          </div>
        )}

        {slide.key === "insights" && (
          <div className="w-full">
            <h1 className="font-display text-5xl font-extrabold text-white">Most interesting insights</h1>
            <div className="mt-8 grid gap-4 lg:grid-cols-2">
              {items.filter((i) => i.flag === "insight" || i.flag === "innovative").map((i) => <Quote key={i.id} item={i} groups={groups} />)}
            </div>
            {!items.some((i) => i.flag === "insight" || i.flag === "innovative") && <Empty text="Tag items as “insight” or “innovative” to show them here." />}
          </div>
        )}
      </main>

      {/* Controls */}
      <footer className={`fixed inset-x-0 bottom-0 z-20 flex items-center gap-2 bg-gradient-to-t from-ink via-ink/90 to-transparent px-6 pb-5 pt-10 transition-opacity ${chrome ? "opacity-100" : "opacity-0 hover:opacity-100"}`}>
        <Link href={`/admin/w/${w.id}`} className="btn !bg-white/10 !text-white hover:!bg-white/20"><X className="h-4 w-4" />Exit</Link>
        <button className="btn !bg-white/10 !text-white hover:!bg-white/20" onClick={() => go(-1)} aria-label="Previous slide"><ChevronLeft className="h-5 w-5" /></button>
        <select className="rounded-xl bg-white/10 px-3 py-2.5 text-sm font-semibold text-white" value={idx} onChange={(e) => setIdx(Number(e.target.value))}>
          {slides.map((s, i) => <option key={s.key} value={i} className="text-ink">{i + 1}. {s.label}</option>)}
        </select>
        <button className="btn !bg-white/10 !text-white hover:!bg-white/20" onClick={() => go(1)} aria-label="Next slide"><ChevronRight className="h-5 w-5" /></button>
        <span className="flex-1" />
        <button className={`btn ${featuredOnly ? "!bg-caution-fill !text-ink" : "!bg-white/10 !text-white"}`} onClick={() => setFeaturedOnly((f) => !f)}><Star className="h-4 w-4" fill={featuredOnly ? "currentColor" : "none"} />{featuredOnly ? "Starred only" : "Showing all"}</button>
        <button className="btn !bg-white/10 !text-white hover:!bg-white/20" onClick={() => setPicker(true)}><ListChecks className="h-4 w-4" />Select contributions</button>
        <button className="btn !bg-white/10 !text-white hover:!bg-white/20" onClick={() => document.documentElement.requestFullscreen?.()} aria-label="Full screen"><Expand className="h-4 w-4" /></button>
      </footer>

      {picker && (
        <div className="fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col bg-surface text-ink shadow-2xl">
          <div className="flex items-center justify-between border-b border-line bg-white px-5 py-4"><p className="font-bold">Star contributions to show</p><button onClick={() => setPicker(false)} aria-label="Close"><X className="h-5 w-5" /></button></div>
          <div className="flex-1 space-y-1.5 overflow-y-auto p-4">
            {pickerItems.map((i) => <ItemCurate key={i.id} item={i} groupName={groups.find((g) => g.id === i.group_id)?.name} showKind />)}
            {pickerItems.length === 0 && <p className="text-sm text-muted">No contributions yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function GroupSlide({ group, items, pick, takeaway, tables }: { group: StakeholderGroup; items: ResponseItem[]; pick: (l: ResponseItem[]) => ResponseItem[]; takeaway: string; tables: number[] }) {
  const gi = items.filter((i) => i.group_id === group.id);
  return (
    <div className="grid w-full flex-1 gap-8 xl:grid-cols-[1fr_320px]">
      <div>
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: group.color }}><GroupIcon name={group.icon} className="h-8 w-8 text-white" /></span>
          <div><p className="text-lg text-white/60">Tables {tables.join(", ")}</p><h1 className="font-display text-5xl font-extrabold text-white">{group.name}</h1></div>
        </div>
        <blockquote className="mt-8 border-l-4 pl-6 font-display text-3xl font-bold leading-snug text-white lg:text-4xl" style={{ borderColor: group.color }}>
          {takeaway || <span className="text-white/40">Key takeaway not written yet</span>}
        </blockquote>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {(["opportunity", "risk", "recommendation"] as const).map((k) => {
            const list = pick(gi.filter((i) => i.kind === k)).slice(0, 4);
            return (
              <div key={k}>
                <p className="text-sm font-bold uppercase tracking-[.14em]" style={{ color: k === "opportunity" ? "#6ee7a0" : k === "risk" ? "#fca5a5" : "#93c5fd" }}>{ITEM_META[k].label}</p>
                <ul className="mt-3 space-y-2">
                  {list.map((i) => <li key={i.id} className="rounded-2xl bg-white/8 px-4 py-3 text-lg ring-1 ring-white/10">{i.text}</li>)}
                  {list.length === 0 && <li className="text-white/40">{gi.some((i) => i.kind === k) ? "Star items to show them" : "–"}</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
      <PitchTimer key={group.id} />
    </div>
  );
}

/** Optional one-minute presentation timer */
function PitchTimer({ seconds = 60 }: { seconds?: number }) {
  const [left, setLeft] = useState(seconds);
  const [run, setRun] = useState(false);
  useEffect(() => {
    if (!run) return;
    const t = setInterval(() => setLeft((l) => { if (l <= 1) { setRun(false); return 0; } return l - 1; }), 1000);
    return () => clearInterval(t);
  }, [run]);
  const pct = left / seconds;
  const r = 70, c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-4 self-start rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
      <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[.14em] text-white/60"><Timer className="h-4 w-4" />Pitch timer</p>
      <div className="relative h-44 w-44">
        <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="80" cy="80" r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="10" />
          <circle cx="80" cy="80" r={r} fill="none" stroke={left <= 10 ? "#f87171" : left <= 20 ? "#fbbf24" : "#12a3c4"} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset 1s linear, stroke .3s" }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-display text-4xl font-extrabold tabular-nums text-white" role="timer">{left === 0 ? "Time" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}</span>
      </div>
      <div className="flex gap-2">
        <button className="btn !bg-white !text-ink" onClick={() => { if (left === 0) setLeft(seconds); setRun((x) => !x); }}>{run ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{run ? "Pause" : "Start"}</button>
        <button className="btn !bg-white/10 !text-white" onClick={() => { setRun(false); setLeft(seconds); }} aria-label="Reset"><RotateCcw className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function CrossSlide({ title, kind, list, groups, featuredOnly }: { title: string; kind: ItemKind; list: ResponseItem[]; groups: StakeholderGroup[]; featuredOnly: boolean }) {
  return (
    <div className="w-full">
      <h1 className="font-display text-5xl font-extrabold text-white">{title}</h1>
      <div className="mt-8 columns-1 gap-4 lg:columns-2 2xl:columns-3">
        {list.slice(0, 18).map((i) => <Quote key={i.id} item={i} groups={groups} />)}
      </div>
      {list.length === 0 && <Empty text={featuredOnly ? `Star ${ITEM_META[kind].label.toLowerCase()} (Select contributions) to show them here, or switch to “Showing all”.` : "Nothing submitted yet."} />}
    </div>
  );
}

function Quote({ item, groups }: { item: ResponseItem; groups: StakeholderGroup[] }) {
  const g = groups.find((x) => x.id === item.group_id);
  return (
    <div className="mb-4 break-inside-avoid rounded-3xl bg-white/8 p-5 ring-1 ring-white/12">
      <p className="text-xl leading-snug">{item.text}</p>
      {g && <p className="mt-3 flex items-center gap-2 text-sm font-semibold" style={{ color: g.color === "#047857" ? "#6ee7a0" : undefined }}><span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} /><span className="text-white/70">{g.name}</span></p>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="m-auto mt-16 max-w-xl text-center text-xl text-white/45">{text}</p>;
}
