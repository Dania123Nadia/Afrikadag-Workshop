"use client";
import { Clock, Pause } from "lucide-react";
import { fmt, useRemaining } from "@/lib/time";
import type { Workshop } from "@/lib/types";

export function TimerBadge({ workshop, large = false, dark = false }: { workshop: Workshop; large?: boolean; dark?: boolean }) {
  const rem = useRemaining(workshop);
  if (rem == null) return null;
  const low = workshop.timer_running && rem <= 60;
  const over = rem === 0 && workshop.timer_running;
  const tone = over ? "bg-stop text-white" : low ? "bg-caution-soft text-caution" : dark ? "bg-white/10 text-white" : "bg-surface text-ink";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold tabular-nums ${tone} ${large ? "px-4 py-2 text-2xl" : "px-3 py-1.5 text-sm"} ${low && !over ? "animate-pulse-soft" : ""}`}
      aria-label={`Time remaining ${fmt(rem)}`}
      role="timer"
    >
      {workshop.timer_running ? <Clock className={large ? "h-5 w-5" : "h-4 w-4"} /> : <Pause className={large ? "h-5 w-5" : "h-4 w-4"} />}
      {over ? "Time's up" : fmt(rem)}
    </span>
  );
}
