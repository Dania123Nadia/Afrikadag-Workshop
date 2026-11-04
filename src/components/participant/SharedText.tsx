"use client";
import { useEffect } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useSharedField } from "@/lib/collab";
import type { GroupField } from "@/lib/types";
import { SaveBadge } from "@/components/ui/SaveBadge";
import { timeAgo } from "@/lib/time";

export function SharedText(props: {
  db: SupabaseClient; groupId: string; field: "notes" | "key_takeaway"; remote?: GroupField; disabled?: boolean;
  rows?: number; placeholder?: string; maxLength?: number; typingCount: number; onTyping: () => void; onState?: (s: string) => void; id?: string;
}) {
  const { text, setText, state, lastSaved, ref } = useSharedField({
    db: props.db, groupId: props.groupId, field: props.field, remote: props.remote, disabled: props.disabled, onLocalEdit: props.onTyping,
  });
  const { onState } = props;
  useEffect(() => { onState?.(state); }, [state, onState]);
  return (
    <div>
      <textarea
        id={props.id}
        ref={ref}
        className="input min-h-[3rem] resize-y leading-relaxed"
        rows={props.rows ?? 6}
        maxLength={props.maxLength ?? 20000}
        value={text}
        disabled={props.disabled}
        placeholder={props.placeholder}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <SaveBadge state={props.disabled && state === "saved" ? "locked" : state} />
        <span className="text-xs text-muted">
          {props.typingCount > 0 ? (
            <span className="font-medium text-brand">Someone at your table is editing this too…</span>
          ) : lastSaved ? `Shared with your group · updated ${timeAgo(lastSaved)}` : "Shared with your group"}
        </span>
      </div>
    </div>
  );
}
