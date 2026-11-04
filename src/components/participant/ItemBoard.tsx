"use client";
import { useState } from "react";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ITEM_META } from "@/lib/content";
import { friendlyError } from "@/lib/supabase";
import type { ItemKind, ResponseItem } from "@/lib/types";

export function ItemBoard({ db, kind, items, groupId, meId, disabled, onChange, onError }: {
  db: SupabaseClient; kind: ItemKind; items: ResponseItem[]; groupId: string; meId: string; disabled?: boolean;
  onChange: (fn: (items: ResponseItem[]) => ResponseItem[]) => void; onError: (m: string) => void;
}) {
  const meta = ITEM_META[kind];
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const list = items.filter((i) => i.kind === kind);

  async function add() {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    const { data, error } = await db.from("response_items").insert({ group_id: groupId, kind, text, author_id: meId }).select().single();
    setBusy(false);
    if (error) return onError(friendlyError(error.message.includes("row-level") ? "LOCKED" : error));
    setDraft("");
    onChange((all) => (all.some((x) => x.id === data.id) ? all : [...all, data as ResponseItem]));
  }
  async function save(id: string) {
    const text = editText.trim();
    if (!text) return;
    const { error } = await db.from("response_items").update({ text }).eq("id", id);
    if (error) return onError(friendlyError(error));
    onChange((all) => all.map((x) => (x.id === id ? { ...x, text } : x)));
    setEditing(null);
  }
  async function remove(id: string) {
    if (!confirm("Remove this point for the whole group?")) return;
    const { error } = await db.from("response_items").delete().eq("id", id);
    if (error) return onError(friendlyError(error));
    onChange((all) => all.filter((x) => x.id !== id));
  }

  return (
    <div>
      <ul className="space-y-2">
        {list.map((it) => (
          <li key={it.id} className="group animate-rise rounded-xl border-l-4 bg-white px-3.5 py-2.5 ring-1 ring-line" style={{ borderLeftColor: meta.color }}>
            {editing === it.id ? (
              <div className="flex gap-2">
                <textarea className="input !py-2 text-sm" rows={2} value={editText} onChange={(e) => setEditText(e.target.value)} maxLength={1000} autoFocus />
                <div className="flex flex-col gap-1">
                  <button className="btn-primary !p-2" onClick={() => save(it.id)} aria-label="Save"><Check className="h-4 w-4" /></button>
                  <button className="btn-ghost !p-2" onClick={() => setEditing(null)} aria-label="Cancel"><X className="h-4 w-4" /></button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <p className="flex-1 whitespace-pre-wrap text-[15px] text-ink">{it.text}</p>
                {!disabled && (
                  <div className="flex shrink-0 gap-0.5 opacity-60 transition group-hover:opacity-100">
                    <button className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink" onClick={() => { setEditing(it.id); setEditText(it.text); }} aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                    <button className="rounded-lg p-1.5 text-muted hover:bg-stop-soft hover:text-stop" onClick={() => remove(it.id)} aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                )}
              </div>
            )}
            {it.author_label && editing !== it.id && <p className="mt-0.5 text-[11px] text-muted">added by {it.author_id === meId ? "you" : it.author_label}</p>}
          </li>
        ))}
        {list.length === 0 && <li className="rounded-xl border border-dashed border-line px-3.5 py-3 text-sm text-muted">Nothing yet. Add the first {meta.one}.</li>}
      </ul>
      {!disabled && (
        <form className="mt-2.5 flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={meta.placeholder} maxLength={1000} aria-label={meta.placeholder} />
          <button className="btn-secondary shrink-0 !px-3" disabled={busy || !draft.trim()} aria-label={`Add ${meta.one}`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}<span className="hidden sm:inline">Add</span>
          </button>
        </form>
      )}
    </div>
  );
}
