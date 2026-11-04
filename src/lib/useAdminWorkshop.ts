"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminDb } from "./supabase";
import { syncClock } from "./time";
import type {
  Announcement, Assignment, GroupField, GroupProgress, Participant, PresenceMeta, Question, Reflection,
  ResponseItem, Stage, StakeholderGroup, Submission, Workshop,
} from "./types";

export interface AdminState {
  workshop: Workshop | null;
  stages: Stage[];
  groups: StakeholderGroup[];
  assignments: Assignment[];
  questions: Question[];
  participants: Participant[];
  fields: GroupField[];
  items: ResponseItem[];
  reflections: Reflection[];
  progress: GroupProgress[];
  submissions: Submission[];
  announcements: Announcement[];
}

const EMPTY: AdminState = {
  workshop: null, stages: [], groups: [], assignments: [], questions: [], participants: [], fields: [], items: [],
  reflections: [], progress: [], submissions: [], announcements: [],
};

type ListKey = Exclude<keyof AdminState, "workshop">;
const TABLES: { table: string; key: ListKey; id: (r: Record<string, unknown>) => string; filter: boolean }[] = [
  { table: "workshop_stages", key: "stages", id: (r) => r.id as string, filter: true },
  { table: "stakeholder_groups", key: "groups", id: (r) => r.id as string, filter: true },
  { table: "group_assignments", key: "assignments", id: (r) => `${r.workshop_id}:${r.table_number}`, filter: true },
  { table: "guiding_questions", key: "questions", id: (r) => r.id as string, filter: false },
  { table: "participants", key: "participants", id: (r) => r.id as string, filter: true },
  { table: "group_fields", key: "fields", id: (r) => `${r.group_id}:${r.field}`, filter: true },
  { table: "response_items", key: "items", id: (r) => r.id as string, filter: true },
  { table: "reflections", key: "reflections", id: (r) => r.participant_id as string, filter: true },
  { table: "group_progress", key: "progress", id: (r) => r.group_id as string, filter: true },
  { table: "submissions", key: "submissions", id: (r) => r.id as string, filter: true },
  { table: "announcements", key: "announcements", id: (r) => r.id as string, filter: true },
];

const sortState = (s: AdminState): AdminState => ({
  ...s,
  stages: [...s.stages].sort((a, b) => a.position - b.position),
  groups: [...s.groups].sort((a, b) => a.position - b.position),
  assignments: [...s.assignments].sort((a, b) => a.table_number - b.table_number),
  questions: [...s.questions].sort((a, b) => a.position - b.position),
  items: [...s.items].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  submissions: [...s.submissions].sort((a, b) => b.submitted_at.localeCompare(a.submitted_at)),
  announcements: [...s.announcements].sort((a, b) => b.created_at.localeCompare(a.created_at)),
});

export function useAdminWorkshop(id: string) {
  const db = adminDb();
  const [state, setState] = useState<AdminState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [presence, setPresence] = useState<PresenceMeta[]>([]);
  const [live, setLive] = useState(false);

  const load = useCallback(async () => {
    const { data: w, error: we } = await db.from("workshops").select("*").eq("id", id).maybeSingle();
    if (we || !w) { setError(we?.message ?? "Workshop not found"); setLoading(false); return; }
    const results = await Promise.all(TABLES.map((t) =>
      t.table === "guiding_questions"
        ? db.from(t.table).select("*, stakeholder_groups!inner(workshop_id)").eq("stakeholder_groups.workshop_id", id)
        : db.from(t.table).select("*").eq("workshop_id", id).limit(5000)));
    const next: AdminState = { ...EMPTY, workshop: w as Workshop };
    results.forEach((r, i) => {
      if (r.error) setError(r.error.message);
      const rows = (r.data ?? []).map((x: Record<string, unknown>) => { const { stakeholder_groups: _sg, ...rest } = x; void _sg; return rest; });
      (next as unknown as Record<string, unknown>)[TABLES[i].key] = rows;
    });
    setState(sortState(next));
    setLoading(false);
  }, [db, id]);

  useEffect(() => { syncClock(db); load(); }, [db, load]);

  useEffect(() => {
    let wasDown = false;
    const ch = db.channel(`admin-${id}`);
    ch.on("postgres_changes", { event: "*", schema: "public", table: "workshops", filter: `id=eq.${id}` }, (p) => {
      if (p.eventType !== "DELETE") setState((s) => ({ ...s, workshop: p.new as Workshop }));
    });
    for (const t of TABLES) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: t.table, ...(t.filter ? { filter: `workshop_id=eq.${id}` } : {}) }, (p) => {
        setState((s) => {
          const list = s[t.key] as unknown as Record<string, unknown>[];
          let nextList: Record<string, unknown>[];
          if (p.eventType === "DELETE") {
            const old = p.old as Record<string, unknown>;
            nextList = list.filter((r) => t.id(r) !== t.id(old) && !(old.id && r.id === old.id));
          } else {
            const row = p.new as Record<string, unknown>;
            if (t.table === "guiding_questions" && !s.groups.some((g) => g.id === row.group_id)) return s;
            const k = t.id(row);
            const i = list.findIndex((r) => t.id(r) === k);
            nextList = i === -1 ? [...list, row] : list.map((r, j) => (j === i ? row : r));
          }
          return sortState({ ...s, [t.key]: nextList } as AdminState);
        });
      });
    }
    // Delete events are not filterable; catch those for every table
    for (const t of TABLES) {
      if (!t.filter) continue;
      ch.on("postgres_changes", { event: "DELETE", schema: "public", table: t.table }, (p) => {
        const old = p.old as Record<string, unknown>;
        setState((s) => ({ ...s, [t.key]: (s[t.key] as unknown as Record<string, unknown>[]).filter((r) => t.id(r) !== t.id(old) && !(old.id && r.id === old.id)) } as AdminState));
      });
    }
    ch.subscribe((st) => {
      if (st === "SUBSCRIBED") { setLive(true); if (wasDown) { wasDown = false; load(); } else setTimeout(load, 2000); }
      else { setLive(false); wasDown = true; }
    });

    const pres = db.channel(`presence-${id}`);
    pres.on("presence", { event: "sync" }, () => {
      const st = pres.presenceState<PresenceMeta>();
      // one entry per participant (a person may have 2 tabs open)
      setPresence(Object.values(st).map((metas) => metas.reduce((a, b) => (b.active_at > a.active_at ? b : a))));
    }).subscribe();

    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); db.removeChannel(ch); db.removeChannel(pres); };
  }, [db, id, load]);

  const control = useCallback(async (action: string, value?: number) => {
    const { data, error } = await db.rpc("admin_control", { p_workshop: id, p_action: action, p_value: value ?? null });
    if (error) throw error;
    setState((s) => ({ ...s, workshop: data as Workshop }));
  }, [db, id]);

  const derived = useMemo(() => {
    const now = Date.now();
    const byGroup = (gid: string) => presence.filter((p) => p.gid === gid);
    return {
      connected: presence.length,
      working: presence.filter((p) => now - (p.active_at ?? 0) < 120000).length,
      byGroup,
    };
  }, [presence]);

  return { db, ...state, state, setState, loading, error, reload: load, presence, live, control, ...derived };
}
