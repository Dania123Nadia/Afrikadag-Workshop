"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { participantDb } from "./supabase";
import { syncClock } from "./time";
import type {
  Announcement, GroupField, GroupProgress, Participant, Question, Reflection, ResponseItem,
  Stage, StakeholderGroup, Submission, Workshop,
} from "./types";

export interface ParticipantState {
  workshop: Workshop;
  me: Participant;
  stages: Stage[];
  groups: StakeholderGroup[];
  questions: Question[];
  fields: Record<string, GroupField>;
  items: ResponseItem[];
  reflections: Reflection[];
  progress: GroupProgress | null;
  lastSubmission: Submission | null;
  announcements: Announcement[];
}

type Status = "loading" | "ready" | "not-joined" | "error";

export function upsertById<T extends Record<string, unknown>>(list: T[], row: T, key = "id"): T[] {
  const i = list.findIndex((x) => x[key] === row[key]);
  if (i === -1) return [...list, row];
  const copy = list.slice();
  copy[i] = row;
  return copy;
}

export function useParticipantWorkshop(code: string) {
  const db = participantDb();
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ParticipantState | null>(null);
  const [connected, setConnected] = useState(true);
  const [groupOnline, setGroupOnline] = useState(1);
  const presenceRef = useRef<RealtimeChannel | null>(null);
  const activeAt = useRef(Date.now());

  const load = useCallback(async () => {
    try {
      const { data: sess } = await db.auth.getSession();
      if (!sess.session) { setStatus("not-joined"); return; }
      const { data: w, error: we } = await db.from("workshops").select("*").eq("access_code", code.toUpperCase()).maybeSingle();
      if (we) throw we;
      if (!w) { setStatus("not-joined"); return; }
      const { data: me } = await db.from("participants").select("*").eq("workshop_id", w.id).eq("user_id", sess.session.user.id).maybeSingle();
      if (!me) { setStatus("not-joined"); return; }
      const g = me.group_id;
      const [stages, groups, questions, fields, items, refl, prog, subs, ann] = await Promise.all([
        db.from("workshop_stages").select("*").eq("workshop_id", w.id).order("position"),
        db.from("stakeholder_groups").select("*").eq("workshop_id", w.id).order("position"),
        db.from("guiding_questions").select("*").eq("group_id", g).order("position"),
        db.from("group_fields").select("*").eq("group_id", g),
        db.from("response_items").select("*").eq("group_id", g).order("created_at"),
        db.from("reflections").select("*").eq("group_id", g),
        db.from("group_progress").select("*").eq("group_id", g).maybeSingle(),
        db.from("submissions").select("*").eq("group_id", g).order("submitted_at", { ascending: false }).limit(1),
        db.from("announcements").select("*").eq("workshop_id", w.id).order("created_at", { ascending: false }).limit(10),
      ]);
      const firstErr = [stages, groups, questions, fields, items, refl, prog, subs, ann].find((r) => r.error)?.error;
      if (firstErr) throw firstErr;
      setData({
        workshop: w as Workshop,
        me: me as Participant,
        stages: (stages.data ?? []) as Stage[],
        groups: (groups.data ?? []) as StakeholderGroup[],
        questions: (questions.data ?? []) as Question[],
        fields: Object.fromEntries(((fields.data ?? []) as GroupField[]).map((f) => [f.field, f])),
        items: (items.data ?? []) as ResponseItem[],
        reflections: (refl.data ?? []) as Reflection[],
        progress: (prog.data ?? null) as GroupProgress | null,
        lastSubmission: ((subs.data ?? [])[0] ?? null) as Submission | null,
        announcements: (ann.data ?? []) as Announcement[],
      });
      setStatus("ready");
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setStatus((s) => (s === "ready" ? "ready" : "error"));
    }
  }, [db, code]);

  useEffect(() => { syncClock(db); load(); }, [db, load]);

  const wid = data?.workshop.id;
  const gid = data?.me.group_id;
  const pid = data?.me.id;

  // Realtime subscriptions (RLS ensures only this group's rows arrive)
  useEffect(() => {
    if (!wid || !gid || !pid) return;
    let wasDown = false;
    const ch = db.channel(`p-${pid}-${gid}`);
    const patch = (fn: (d: ParticipantState) => ParticipantState) => setData((d) => (d ? fn(d) : d));
    ch.on("postgres_changes", { event: "*", schema: "public", table: "workshops", filter: `id=eq.${wid}` }, (p) => {
      if (p.eventType === "DELETE") { setStatus("not-joined"); return; }
      patch((d) => ({ ...d, workshop: p.new as Workshop }));
    })
      .on("postgres_changes", { event: "*", schema: "public", table: "workshop_stages", filter: `workshop_id=eq.${wid}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "stakeholder_groups", filter: `workshop_id=eq.${wid}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "guiding_questions", filter: `group_id=eq.${gid}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "participants", filter: `id=eq.${pid}` }, (p) => {
        if (p.eventType === "DELETE") { setStatus("not-joined"); return; }
        load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_fields", filter: `group_id=eq.${gid}` }, (p) => {
        const row = p.new as GroupField;
        if (!row?.field) return;
        patch((d) => ({ ...d, fields: { ...d.fields, [row.field]: row } }));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "response_items", filter: `group_id=eq.${gid}` }, (p) => {
        if (p.eventType === "DELETE") patch((d) => ({ ...d, items: d.items.filter((i) => i.id !== (p.old as ResponseItem).id) }));
        else patch((d) => ({ ...d, items: upsertById(d.items as unknown as Record<string, unknown>[], p.new) as unknown as ResponseItem[] }));
      })
      // Delete events cannot be filtered server-side; ignore unknown ids
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "response_items" }, (p) => {
        patch((d) => ({ ...d, items: d.items.filter((i) => i.id !== (p.old as ResponseItem).id) }));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "reflections", filter: `group_id=eq.${gid}` }, (p) => {
        if (p.eventType === "DELETE") return;
        patch((d) => ({ ...d, reflections: upsertById(d.reflections as unknown as Record<string, unknown>[], p.new, "participant_id") as unknown as Reflection[] }));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "group_progress", filter: `group_id=eq.${gid}` }, (p) => {
        if (p.eventType !== "DELETE") patch((d) => ({ ...d, progress: p.new as GroupProgress }));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "submissions", filter: `group_id=eq.${gid}` }, (p) => {
        patch((d) => ({ ...d, lastSubmission: p.new as Submission }));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements", filter: `workshop_id=eq.${wid}` }, (p) => {
        if (p.eventType === "DELETE") patch((d) => ({ ...d, announcements: d.announcements.filter((a) => a.id !== (p.old as Announcement).id) }));
        else patch((d) => ({ ...d, announcements: [p.new as Announcement, ...d.announcements.filter((a) => a.id !== (p.new as Announcement).id)] }));
      })
      .subscribe((s) => {
        if (s === "SUBSCRIBED") {
          setConnected(true);
          // Catch up on anything missed while offline, and on changes made in the
          // ~second the server needs to activate a fresh subscription.
          if (wasDown) { wasDown = false; load(); } else setTimeout(load, 2000);
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
          setConnected(false);
          wasDown = true;
        }
      });

    // Presence: lets facilitators see who is connected (no names are shared)
    const pres = db.channel(`presence-${wid}`, { config: { presence: { key: pid } } });
    presenceRef.current = pres;
    const countGroup = () => {
      const st = pres.presenceState<{ gid: string }>();
      setGroupOnline(Object.values(st).filter((metas) => metas.some((m) => m.gid === gid)).length);
    };
    pres.on("presence", { event: "sync" }, countGroup).subscribe(async (s) => {
      if (s === "SUBSCRIBED") await pres.track({ pid, gid, table: data?.me.table_number, active_at: activeAt.current });
    });

    const beat = setInterval(() => { db.rpc("touch_participant", { p_workshop: wid }); }, 45000);

    // Safety net in case Realtime is throttled or silently drops: check the
    // workshop state (stage, timer, lock) every 20 s, and reload everything
    // every 10 s while the realtime channel is down.
    const poll = setInterval(async () => {
      if (wasDown) { load(); return; }
      const { data: fresh } = await db.from("workshops").select("*").eq("id", wid).maybeSingle();
      if (fresh) setData((d) => (d && d.workshop.updated_at !== fresh.updated_at ? { ...d, workshop: fresh as Workshop } : d));
    }, 20000);
    const pollDown = setInterval(() => { if (wasDown) load(); }, 10000);
    db.rpc("touch_participant", { p_workshop: wid });
    const onVis = () => { if (document.visibilityState === "visible") { syncClock(db); load(); } };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      clearInterval(beat);
      clearInterval(poll);
      clearInterval(pollDown);
      document.removeEventListener("visibilitychange", onVis);
      db.removeChannel(ch);
      db.removeChannel(pres);
      presenceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, wid, gid, pid, load]);

  // Called when the participant types: marks them "working" for facilitators (throttled)
  const markActive = useCallback(() => {
    const now = Date.now();
    if (now - activeAt.current < 20000) return;
    activeAt.current = now;
    const pres = presenceRef.current;
    if (pres && data) pres.track({ pid: data.me.id, gid: data.me.group_id, table: data.me.table_number, active_at: now });
  }, [data]);

  return { db, status, error, data, setData, reload: load, connected, groupOnline, markActive };
}
