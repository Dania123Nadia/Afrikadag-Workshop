import type { AdminState } from "./useAdminWorkshop";

function download(name: string, body: string, type: string) {
  const blob = new Blob([body], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows: (string | number | boolean | null | undefined)[][]) => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\n");

/** Everything participants produced, grouped per stakeholder. Participant identities are not included. */
export function buildExport(s: AdminState) {
  return {
    exported_at: new Date().toISOString(),
    workshop: { title: s.workshop?.title, code: s.workshop?.access_code },
    groups: s.groups.map((g) => {
      const latest = s.submissions.find((x) => x.group_id === g.id);
      const prog = s.progress.find((p) => p.group_id === g.id);
      const items = s.items.filter((i) => i.group_id === g.id);
      return {
        stakeholder: g.name,
        tables: s.assignments.filter((a) => a.group_id === g.id).map((a) => a.table_number),
        participants: s.participants.filter((p) => p.group_id === g.id).length,
        status: prog?.status ?? "draft",
        submitted_at: prog?.submitted_at ?? null,
        live_draft: {
          key_takeaway: s.fields.find((f) => f.group_id === g.id && f.field === "key_takeaway")?.content ?? "",
          notes: s.fields.find((f) => f.group_id === g.id && f.field === "notes")?.content ?? "",
          opportunities: items.filter((i) => i.kind === "opportunity").map((i) => ({ text: i.text, featured: i.featured, flag: i.flag })),
          risks: items.filter((i) => i.kind === "risk").map((i) => ({ text: i.text, featured: i.featured, flag: i.flag })),
          recommendations: items.filter((i) => i.kind === "recommendation").map((i) => ({ text: i.text, featured: i.featured, flag: i.flag })),
          first_reactions: s.reflections.filter((r) => r.group_id === g.id && r.text.trim()).map((r) => r.text),
        },
        last_submission: latest?.snapshot ?? null,
      };
    }),
    announcements: s.announcements.map((a) => ({ message: a.message, at: a.created_at })),
    note: "live_draft = current content of the shared workspace. last_submission = the snapshot the group formally submitted.",
  };
}

export function exportJson(s: AdminState) {
  const data = buildExport(s);
  download(`afrikadag-${s.workshop?.access_code}-results.json`, JSON.stringify(data, null, 2), "application/json");
}

export function exportCsv(s: AdminState) {
  const rows: (string | number | boolean | null)[][] = [["stakeholder_group", "tables", "type", "text", "featured", "flag", "status", "source"]];
  for (const g of s.groups) {
    const tables = s.assignments.filter((a) => a.group_id === g.id).map((a) => a.table_number).join(" ");
    const st = s.progress.find((p) => p.group_id === g.id)?.status ?? "draft";
    const kt = s.fields.find((f) => f.group_id === g.id && f.field === "key_takeaway")?.content;
    const notes = s.fields.find((f) => f.group_id === g.id && f.field === "notes")?.content;
    if (kt) rows.push([g.name, tables, "key_takeaway", kt, null, null, st, "live draft"]);
    if (notes) rows.push([g.name, tables, "notes", notes, null, null, st, "live draft"]);
    for (const i of s.items.filter((x) => x.group_id === g.id)) rows.push([g.name, tables, i.kind, i.text, i.featured, i.flag, st, "live draft"]);
    for (const r of s.reflections.filter((x) => x.group_id === g.id && x.text.trim())) rows.push([g.name, tables, "first_reaction", r.text, null, null, st, "individual"]);
    const sub = s.submissions.find((x) => x.group_id === g.id);
    if (sub) rows.push([g.name, tables, "submitted_key_takeaway", sub.snapshot.key_takeaway, null, null, st, `submitted ${sub.submitted_at}`]);
  }
  download(`afrikadag-${s.workshop?.access_code}-results.csv`, toCsv(rows), "text/csv;charset=utf-8");
}
