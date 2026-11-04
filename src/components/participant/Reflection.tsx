"use client";
import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Reflection as R } from "@/lib/types";
import { SaveBadge } from "@/components/ui/SaveBadge";
import type { SaveState } from "@/lib/collab";

export function ReflectionBox({ db, workshopId, meId, reflections, disabled, onTyping }: {
  db: SupabaseClient; workshopId: string; meId: string; reflections: R[]; disabled?: boolean; onTyping: () => void;
}) {
  const mine = reflections.find((r) => r.participant_id === meId);
  const key = `afrikadag-reflection:${meId}`;
  const [text, setText] = useState<string>(() => {
    try { return localStorage.getItem(key) ?? mine?.text ?? ""; } catch { return mine?.text ?? ""; }
  });
  const [state, setState] = useState<SaveState>("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(text);

  async function save() {
    setState("saving");
    const { error } = await db.rpc("save_reflection", { p_workshop: workshopId, p_text: latest.current });
    if (error) {
      setState(error.message.includes("LOCKED") ? "locked" : "offline");
      if (!error.message.includes("LOCKED")) timer.current = setTimeout(save, 4000);
      return;
    }
    try { localStorage.removeItem(key); } catch {}
    setState("saved");
  }
  // push any draft left over from a refresh
  useEffect(() => {
    if (mine && text !== mine.text && text) { latest.current = text; save(); }
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const others = reflections.filter((r) => r.participant_id !== meId && r.text.trim());
  return (
    <div>
      <textarea className="input resize-y" rows={2} maxLength={1000} disabled={disabled} value={text}
        placeholder="My first reaction to the proposal is…"
        onChange={(e) => {
          setText(e.target.value); latest.current = e.target.value; setState("unsaved"); onTyping();
          try { localStorage.setItem(key, e.target.value); } catch {}
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(save, 800);
        }} />
      <div className="mt-1.5 flex items-center justify-between"><SaveBadge state={state} /><span className="text-xs text-muted">Your own reaction · visible to your group</span></div>
      {others.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="eyebrow">Your table so far</p>
          {others.map((r) => (
            <p key={r.participant_id} className="rounded-xl bg-surface px-3 py-2 text-sm"><span className="font-semibold text-ink">{r.author_label}: </span>{r.text}</p>
          ))}
        </div>
      )}
    </div>
  );
}
