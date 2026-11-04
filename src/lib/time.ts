"use client";
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Workshop } from "./types";

// Difference between the database clock and this device's clock, so that every
// screen in the room shows the same countdown even if a phone's clock is off.
let offsetMs = 0;
export async function syncClock(db: SupabaseClient) {
  try {
    const t0 = Date.now();
    const { data } = await db.rpc("server_time");
    const t1 = Date.now();
    if (data) offsetMs = new Date(data as string).getTime() - (t0 + t1) / 2;
  } catch { /* keep previous offset */ }
}
export const serverNow = () => Date.now() + offsetMs;

export function remainingSeconds(w: Pick<Workshop, "timer_running" | "timer_ends_at" | "timer_remaining"> | null) {
  if (!w) return null;
  if (w.timer_running && w.timer_ends_at) return Math.max(0, Math.ceil((new Date(w.timer_ends_at).getTime() - serverNow()) / 1000));
  return w.timer_remaining ?? null;
}

export function useRemaining(w: Pick<Workshop, "timer_running" | "timer_ends_at" | "timer_remaining"> | null) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!w?.timer_running) return;
    const t = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(t);
  }, [w?.timer_running]);
  return remainingSeconds(w);
}

export function fmt(sec: number | null | undefined) {
  if (sec == null) return "--:--";
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((serverNow() - new Date(iso).getTime()) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
