"use client";
import { useState } from "react";
import { ArrowRight, ChevronDown, GraduationCap, RefreshCcw, TrafficCone } from "lucide-react";
import { COTRAINING_STEPS, TRAFFIC, contentOf } from "@/lib/content";
import type { WorkshopContent } from "@/lib/types";

/** Visual traffic light explainer */
export function TrafficLight({ content, compact = false }: { content?: WorkshopContent; compact?: boolean }) {
  const c = contentOf(content);
  const examples = { green: c.green_examples, amber: c.amber_examples, red: c.red_examples } as Record<string, string>;
  return (
    <div className={`grid gap-2.5 ${compact ? "" : "sm:grid-cols-3"}`}>
      {TRAFFIC.map((t, i) => (
        <div key={t.key} className="animate-rise rounded-2xl border p-4" style={{ background: t.soft, borderColor: `color-mix(in srgb, ${t.color} 25%, transparent)`, animationDelay: `${i * 80}ms` }}>
          <div className="flex items-center gap-2.5">
            <span className="h-4 w-4 rounded-full ring-4" style={{ background: t.key === "amber" ? "var(--color-caution-fill)" : t.color, ["--tw-ring-color" as string]: `color-mix(in srgb, ${t.color} 22%, transparent)` }} />
            <span className="text-sm font-bold uppercase tracking-wide" style={{ color: t.color }}>{t.label}</span>
            <span className="text-sm font-semibold text-ink">· {t.title}</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{t.text}</p>
          {examples[t.key] && <p className="mt-2 text-xs text-muted"><span className="font-semibold">Examples: </span>{examples[t.key]}</p>}
        </div>
      ))}
    </div>
  );
}

function CircularDiagram() {
  return (
    <svg viewBox="0 0 320 120" className="h-auto w-full max-w-sm" role="img" aria-label="Circular migration: work period in the Netherlands, return to Kenya, possible next period">
      <defs>
        <marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#12a3c4" /></marker>
      </defs>
      <rect x="8" y="34" width="96" height="52" rx="14" fill="#e8f6ec" />
      <text x="56" y="58" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0b1f3a">Kenya</text>
      <text x="56" y="75" textAnchor="middle" fontSize="10.5" fill="#34465e">training · return</text>
      <rect x="216" y="34" width="96" height="52" rx="14" fill="#e7f0fb" />
      <text x="264" y="58" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0b1f3a">Netherlands</text>
      <text x="264" y="75" textAnchor="middle" fontSize="10.5" fill="#34465e">work period</text>
      <path d="M108 44 C 150 8, 170 8, 212 44" fill="none" stroke="#12a3c4" strokeWidth="2.5" markerEnd="url(#ah)" />
      <path d="M212 78 C 170 112, 150 112, 108 78" fill="none" stroke="#12a3c4" strokeWidth="2.5" strokeDasharray="5 4" markerEnd="url(#ah)" />
      <text x="160" y="16" textAnchor="middle" fontSize="10.5" fill="#34465e">fixed period</text>
      <text x="160" y="116" textAnchor="middle" fontSize="10.5" fill="#34465e">return · possibly again</text>
    </svg>
  );
}

const PARTS = [
  { key: "circular", letter: "A", title: "Circular migration", icon: RefreshCcw, lead: "Work for a set period, return, and possibly come back again." },
  { key: "traffic", letter: "B", title: "Traffic light system", icon: TrafficCone, lead: "Which sectors? Decided by labour needs in both countries." },
  { key: "cotraining", letter: "C", title: "Co-training", icon: GraduationCap, lead: "Joint selection and training for green and amber sectors." },
] as const;

/** The three components shown as one integrated proposal */
export function ProposalOverview({ content, defaultOpen }: { content?: WorkshopContent; defaultOpen?: string }) {
  const c = contentOf(content);
  const [open, setOpen] = useState<string | null>(defaultOpen ?? "circular");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
        {PARTS.map((p, i) => (
          <span key={p.key} className="flex items-center gap-2">
            <span className="rounded-full bg-white px-2.5 py-1 text-ink ring-1 ring-line">{p.letter} · {p.title}</span>
            {i < PARTS.length - 1 && <ArrowRight className="h-3.5 w-3.5" />}
          </span>
        ))}
        <span className="text-muted">= one integrated proposal</span>
      </div>
      {PARTS.map((p) => {
        const I = p.icon;
        const isOpen = open === p.key;
        return (
          <section key={p.key} className="card overflow-hidden">
            <button className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setOpen(isOpen ? null : p.key)} aria-expanded={isOpen}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"><I className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="eyebrow">Part {p.letter}</span>
                <span className="block font-display text-base font-bold text-ink">{p.title}</span>
                <span className="block text-sm text-muted">{p.lead}</span>
              </span>
              <ChevronDown className={`h-5 w-5 shrink-0 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <div className="animate-rise space-y-4 border-t border-line px-4 pb-5 pt-4">
                <p className="text-[15px] leading-relaxed">{c[p.key]}</p>
                {p.key === "circular" && <CircularDiagram />}
                {p.key === "traffic" && <TrafficLight content={content} />}
                {p.key === "cotraining" && (
                  <ol className="grid gap-2 sm:grid-cols-2">
                    {COTRAINING_STEPS.map((s, i) => (
                      <li key={s} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5 text-sm text-ink">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">{i + 1}</span>{s}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
