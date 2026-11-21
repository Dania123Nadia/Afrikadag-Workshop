import type { SupabaseClient } from "@supabase/supabase-js";

/** Number of stakeholder groups in the built-in Afrikadag template (see admin_create_workshop). */
export const TEMPLATE_GROUPS = 5;

type Err = { message: string } | null;

/**
 * Create a workshop with `tablesPerGroup` tables for every stakeholder group.
 *
 * Without a source the built-in Afrikadag template is used. With a source
 * workshop, its stakeholder groups (profiles, colours, icons) and their
 * guiding questions are copied instead, so a new workshop gets exactly the
 * same stakeholders as an earlier one (for example AFRIKA24).
 *
 * Tables are numbered 1, 2, 3 … and handed out in turn (1→A, 2→B …), so the
 * table count always grows with the number of stakeholders.
 */
export async function createWorkshop(
  db: SupabaseClient,
  opts: { title: string; code: string; tablesPerGroup: number; sourceWorkshopId: string | null },
): Promise<{ id: string | null; error: Err }> {
  const per = Math.max(1, Math.floor(opts.tablesPerGroup) || 1);

  if (!opts.sourceWorkshopId) {
    const { data, error } = await db.rpc("admin_create_workshop", { p_title: opts.title, p_code: opts.code, p_tables: per * TEMPLATE_GROUPS });
    return { id: (data as string) ?? null, error };
  }

  // Read the stakeholders to copy before creating anything.
  const { data: srcGroups, error: ge } = await db.from("stakeholder_groups").select("*").eq("workshop_id", opts.sourceWorkshopId).order("position");
  if (ge) return { id: null, error: ge };
  if (!srcGroups?.length) return { id: null, error: { message: "That workshop has no stakeholder groups to copy." } };
  const { data: srcQuestions, error: qe } = await db.from("guiding_questions").select("*").in("group_id", srcGroups.map((g) => g.id)).order("position");
  if (qe) return { id: null, error: qe };

  // Stages and introduction texts come from the template; one table for now.
  const { data: wid, error: ce } = await db.rpc("admin_create_workshop", { p_title: opts.title, p_code: opts.code, p_tables: 1 });
  if (ce || !wid) return { id: null, error: ce };
  const id = wid as string;

  const fail = async (error: Err) => {
    // Do not leave a half-built workshop behind.
    await db.rpc("admin_delete_workshop", { p_workshop: id });
    return { id: null, error };
  };

  // Swap the template stakeholders (their tables and questions cascade) for copies.
  const { error: de } = await db.from("stakeholder_groups").delete().eq("workshop_id", id);
  if (de) return fail(de);

  const { data: newGroups, error: ie } = await db.from("stakeholder_groups").insert(
    srcGroups.map((g, i) => ({
      workshop_id: id, position: i, name: g.name, icon: g.icon, color: g.color,
      who: g.who, interests: g.interests, concerns: g.concerns, illustrative: g.illustrative,
    })),
  ).select("id, position");
  if (ie || !newGroups) return fail(ie);
  const idByPos = new Map(newGroups.map((g) => [g.position as number, g.id as string]));
  const newIdOf = new Map(srcGroups.map((g, i) => [g.id as string, idByPos.get(i)!]));

  if (srcQuestions?.length) {
    const { error: qie } = await db.from("guiding_questions").insert(
      srcQuestions.map((q) => ({ group_id: newIdOf.get(q.group_id)!, position: q.position, text: q.text, level: q.level })),
    );
    if (qie) return fail(qie);
  }

  const n = srcGroups.length;
  const { error: ae } = await db.from("group_assignments").insert(
    Array.from({ length: n * per }, (_, i) => ({ workshop_id: id, table_number: i + 1, group_id: idByPos.get(i % n)! })),
  );
  if (ae) return fail(ae);

  return { id, error: null };
}
