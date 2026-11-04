"use client";
import { AlertTriangle, Check, CloudOff, Loader2, Lock, PencilLine } from "lucide-react";
import type { SaveState } from "@/lib/collab";

export function SaveBadge({ state }: { state: SaveState }) {
  const map = {
    saved: { icon: Check, text: "Saved", cls: "text-go" },
    unsaved: { icon: PencilLine, text: "Typing…", cls: "text-muted" },
    saving: { icon: Loader2, text: "Saving…", cls: "text-muted", spin: true },
    offline: { icon: CloudOff, text: "Offline: kept on this device", cls: "text-caution" },
    locked: { icon: Lock, text: "Locked by facilitator", cls: "text-caution" },
    error: { icon: AlertTriangle, text: "Not saved yet, retrying", cls: "text-stop" },
  } as const;
  const m = map[state];
  const I = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${m.cls}`} aria-live="polite">
      <I className={`h-3.5 w-3.5 ${"spin" in m ? "animate-spin" : ""}`} /> {m.text}
    </span>
  );
}
