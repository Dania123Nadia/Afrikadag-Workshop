"use client";
import { Lightbulb, Star, Swords, Sparkles } from "lucide-react";
import { adminDb } from "@/lib/supabase";
import { ITEM_META } from "@/lib/content";
import type { ItemFlag, ResponseItem } from "@/lib/types";

const FLAGS: { key: Exclude<ItemFlag, null>; label: string; icon: typeof Star }[] = [
  { key: "insight", label: "Insight", icon: Lightbulb },
  { key: "innovative", label: "Innovative", icon: Sparkles },
  { key: "disagreement", label: "Disagreement", icon: Swords },
];

/** Original participant text + facilitator curation (feature for presentation, tag). Never edits the text. */
export function ItemCurate({ item, groupName, showKind = false, onChange }: { item: ResponseItem; groupName?: string; showKind?: boolean; onChange?: (i: ResponseItem) => void }) {
  const db = adminDb();
  const meta = ITEM_META[item.kind];
  async function update(patch: Partial<ResponseItem>) {
    onChange?.({ ...item, ...patch });
    await db.from("response_items").update(patch).eq("id", item.id);
  }
  return (
    <div className="rounded-xl border-l-4 bg-white px-3 py-2 ring-1 ring-line" style={{ borderLeftColor: meta.color }}>
      <div className="flex items-start gap-2">
        <p className="flex-1 whitespace-pre-wrap text-sm text-ink">{item.text}</p>
        <button onClick={() => update({ featured: !item.featured })} title={item.featured ? "Shown in presentation" : "Show in presentation"}
          className={`rounded-lg p-1 transition ${item.featured ? "text-caution-fill" : "text-slate-300 hover:text-caution-fill"}`} aria-pressed={item.featured}>
          <Star className="h-4 w-4" fill={item.featured ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {showKind && <span className="chip !px-2 !py-0.5 text-[10px]" style={{ background: meta.soft, color: meta.color }}>{meta.one}</span>}
        {groupName && <span className="text-[11px] font-semibold text-muted">{groupName}</span>}
        <span className="flex-1" />
        {FLAGS.map((f) => {
          const I = f.icon;
          const on = item.flag === f.key;
          return (
            <button key={f.key} onClick={() => update({ flag: on ? null : f.key })} title={`Tag as ${f.label.toLowerCase()}`}
              className={`chip !px-2 !py-0.5 text-[10px] transition ${on ? "bg-ink text-white" : "bg-surface text-muted hover:text-ink"}`}>
              <I className="h-3 w-3" />{f.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
