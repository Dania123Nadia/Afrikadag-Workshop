import type { Assignment, StakeholderGroup } from "./types";

/** One table as shown to people: "Dutch Government 2" (table 7). */
export interface NamedTable { table_number: number; group_name: string; group_color: string; group_icon: string; group_position: number; nth: number }

/** "Dutch Government 2". The number counts the tables of that stakeholder, in table-number order. */
export const tableLabel = (t: Pick<NamedTable, "group_name" | "nth">) => `${t.group_name} ${t.nth}`;

/** Name every table from the facilitator's data (same numbering as the workshop_tables RPC). */
export function nameTables(assignments: Assignment[], groups: StakeholderGroup[]): NamedTable[] {
  const seen = new Map<string, number>();
  const out: NamedTable[] = [];
  for (const a of [...assignments].sort((x, y) => x.table_number - y.table_number)) {
    const g = groups.find((x) => x.id === a.group_id);
    if (!g) continue;
    const nth = (seen.get(g.id) ?? 0) + 1;
    seen.set(g.id, nth);
    out.push({ table_number: a.table_number, group_name: g.name, group_color: g.color, group_icon: g.icon, group_position: g.position, nth });
  }
  return out.sort((x, y) => x.group_position - y.group_position || x.group_name.localeCompare(y.group_name) || x.nth - y.nth);
}

/** Lookup table number → label, e.g. 7 → "Dutch Government 2". */
export function labelMap(assignments: Assignment[], groups: StakeholderGroup[]): Map<number, string> {
  return new Map(nameTables(assignments, groups).map((t) => [t.table_number, tableLabel(t)]));
}
