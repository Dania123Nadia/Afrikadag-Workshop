"use client";
/**
 * Shared text field with autosave, real-time sync and conflict-free merging.
 *
 * How it works (differential synchronisation):
 *  - Each field has a `version` in the database. A save sends the version the
 *    edit was based on. If someone else saved first, the database rejects the
 *    save and returns the latest text.
 *  - The client then rebases its own edits onto the latest text using
 *    an exact 3-way merge (src/lib/merge3.mjs) and saves
 *    again. Concurrent typing by several people at a table is therefore merged,
 *    not overwritten.
 *  - Unsaved edits are also written to localStorage, so a refresh, a crash or
 *    losing Wi-Fi does not lose work. They are merged back in on reload.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GroupField } from "./types";
import { mapCursor, merge3 } from "./merge3.mjs";

export { merge3, mapCursor };

export type SaveState = "saved" | "unsaved" | "saving" | "offline" | "locked" | "error";

interface Options {
  db: SupabaseClient;
  groupId: string;
  field: "notes" | "key_takeaway";
  remote: GroupField | undefined; // latest row from realtime/initial load
  disabled?: boolean;
  onLocalEdit?: () => void;
}

const draftKey = (g: string, f: string) => `afrikadag-draft:${g}:${f}`;

export function useSharedField({ db, groupId, field, remote, disabled, onLocalEdit }: Options) {
  const [text, setTextState] = useState<string>(remote?.content ?? "");
  const [state, setState] = useState<SaveState>("saved");
  const [lastSaved, setLastSaved] = useState<string | null>(remote?.updated_at ?? null);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const base = useRef<{ content: string; version: number }>({ content: remote?.content ?? "", version: remote?.version ?? 0 });
  const local = useRef<string>(remote?.content ?? "");
  const inflight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(1000);
  const initialised = useRef(false);

  // Replace the visible text while keeping the user's cursor in place
  const applyText = useCallback((next: string) => {
    const el = ref.current;
    const prev = local.current;
    local.current = next;
    if (el && document.activeElement === el && prev !== next) {
      const s = mapCursor(prev, next, el.selectionStart);
      const e = mapCursor(prev, next, el.selectionEnd);
      setTextState(next);
      requestAnimationFrame(() => {
        try { el.setSelectionRange(s, e); } catch { /* ignore */ }
      });
    } else setTextState(next);
  }, []);

  const persistDraft = useCallback(() => {
    try {
      if (local.current === base.current.content) localStorage.removeItem(draftKey(groupId, field));
      else localStorage.setItem(draftKey(groupId, field), JSON.stringify({ base: base.current, text: local.current, at: Date.now() }));
    } catch { /* storage may be unavailable */ }
  }, [groupId, field]);

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (inflight.current) return;
    if (local.current === base.current.content) { setState("saved"); persistDraft(); return; }
    inflight.current = true;
    setState("saving");
    const sending = local.current;
    try {
      const { data, error } = await db.rpc("save_group_field", {
        p_group: groupId, p_field: field, p_content: sending, p_base_version: base.current.version,
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as { ok: boolean; version: number; content: string; updated_at: string };
      if (row.ok) {
        base.current = { content: sending, version: row.version };
        setLastSaved(row.updated_at);
        retryDelay.current = 1000;
      } else {
        // Someone saved first: rebase my edits on top of theirs
        const merged = merge3(base.current.content, local.current, row.content);
        base.current = { content: row.content, version: row.version };
        applyText(merged);
      }
      inflight.current = false;
      persistDraft();
      if (local.current !== base.current.content) {
        setState("unsaved");
        timer.current = setTimeout(flush, row.ok ? 300 : 50);
      } else setState("saved");
    } catch (err) {
      inflight.current = false;
      const msg = (err as { message?: string })?.message ?? "";
      persistDraft();
      if (msg.includes("LOCKED")) { setState("locked"); return; }
      setState(/fetch|network|Failed/i.test(msg) || !navigator.onLine ? "offline" : "error");
      timer.current = setTimeout(flush, retryDelay.current);
      retryDelay.current = Math.min(retryDelay.current * 2, 15000);
    }
  }, [db, groupId, field, applyText, persistDraft]);

  // Initial load: restore any unsaved draft from this device
  useEffect(() => {
    if (!remote || initialised.current) return;
    initialised.current = true;
    base.current = { content: remote.content, version: remote.version };
    let start = remote.content;
    try {
      const raw = localStorage.getItem(draftKey(groupId, field));
      if (raw) {
        const d = JSON.parse(raw) as { base: { content: string; version: number }; text: string };
        if (d.text !== d.base.content) start = merge3(d.base.content, d.text, remote.content);
      }
    } catch { /* ignore */ }
    local.current = start;
    setTextState(start);
    setLastSaved(remote.updated_at);
    if (start !== remote.content) { setState("unsaved"); timer.current = setTimeout(flush, 500); }
  }, [remote, groupId, field, flush]);

  // Remote updates (realtime)
  useEffect(() => {
    if (!remote || !initialised.current) return;
    if (remote.version <= base.current.version) return;
    if (inflight.current) return; // the save response will reconcile
    const dirty = local.current !== base.current.content;
    const merged = dirty ? merge3(base.current.content, local.current, remote.content) : remote.content;
    base.current = { content: remote.content, version: remote.version };
    setLastSaved(remote.updated_at);
    applyText(merged);
    if (merged !== remote.content) { setState("unsaved"); if (!timer.current) timer.current = setTimeout(flush, 400); }
    else setState("saved");
  }, [remote, applyText, flush]);

  // Save on tab hide / unload
  useEffect(() => {
    const onHide = () => { if (local.current !== base.current.content) { persistDraft(); flush(); } };
    const onOnline = () => { if (local.current !== base.current.content) flush(); };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("online", onOnline);
    };
  }, [flush, persistDraft]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const setText = useCallback((next: string) => {
    if (disabled) return;
    local.current = next;
    setTextState(next);
    setState("unsaved");
    persistDraft();
    onLocalEdit?.();
    if (timer.current) clearTimeout(timer.current);
    // ~1.2 s debounce keeps Realtime traffic well below the project's message quota
    timer.current = setTimeout(flush, 1200);
  }, [disabled, flush, persistDraft, onLocalEdit]);

  return { text, setText, state, lastSaved, ref, flush };
}
