"use client";
import { Check } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Stage } from "@/lib/types";

/** Persistent step tracker: completed, current and upcoming stages. */
export function ProgressTracker({ stages, current, started, dark = false }: { stages: Stage[]; current: number; started: boolean; dark?: boolean }) {
  const scroller = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>("[data-current=true]");
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [current]);
  return (
    <nav aria-label="Workshop progress">
      <ol ref={scroller} className="no-scrollbar flex items-center gap-1 overflow-x-auto py-1">
        {stages.map((s, i) => {
          const done = started && i < current;
          const now = started && i === current;
          return (
            <li key={s.id} data-current={now} className="flex shrink-0 items-center gap-1" aria-current={now ? "step" : undefined}>
              <div
                className={[
                  "flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs font-semibold transition-all duration-300",
                  now ? (dark ? "bg-white text-ink" : "bg-ink text-white shadow-md") : done ? (dark ? "text-white/80" : "text-ink") : dark ? "text-white/45" : "text-muted",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-6 w-6 items-center justify-center rounded-full text-[11px]",
                    now ? (dark ? "bg-brand text-white" : "bg-accent text-white") : done ? "bg-go text-white" : dark ? "border border-white/30" : "border border-line bg-white",
                  ].join(" ")}
                >
                  {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span className={now ? "" : "hidden sm:inline"}>{s.title}</span>
              </div>
              {i < stages.length - 1 && <span className={`h-px w-3 sm:w-5 ${done ? "bg-go" : dark ? "bg-white/25" : "bg-line"}`} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
