/**
 * Transparent, rule-based pattern finding. No AI and no interpretation:
 * every number links back to the original participant sentences.
 */
import type { ItemKind, ResponseItem } from "./types";

const STOP = new Set(`a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just let me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves
need needs must make makes making get gets way ways thing things lot lots many much one two well like also may might can't cannot dont don't it's they're there's should've etc e.g eg i.e ie via per new more less very really maybe yes yeah
model proposal migration migrants migrant people countries country`.split(/\s+/));

export function normalise(word: string) {
  let w = word.toLowerCase().replace(/[^a-zÀ-ɏ-]/g, "");
  if (w.length > 4 && w.endsWith("ies")) w = w.slice(0, -3) + "y";
  else if (w.length > 4 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  return w;
}

export function terms(text: string): string[] {
  const words = text.split(/[\s,.;:!?()"“”'’/–—]+/).map(normalise).filter((w) => w.length >= 3 && !STOP.has(w));
  const out = new Set<string>();
  words.forEach((w, i) => {
    if (w.length >= 4) out.add(w);
    if (i < words.length - 1) out.add(`${w} ${words[i + 1]}`);
  });
  return [...out];
}

export interface Term { term: string; items: ResponseItem[]; groups: Set<string> }

export function termIndex(items: ResponseItem[]) {
  const map = new Map<string, Term>();
  for (const it of items) for (const t of terms(it.text)) {
    let e = map.get(t);
    if (!e) { e = { term: t, items: [], groups: new Set() }; map.set(t, e); }
    e.items.push(it); e.groups.add(it.group_id);
  }
  return map;
}

/** Most frequent terms; bigrams win over their single words when equally frequent. */
export function topTerms(items: ResponseItem[], kind: ItemKind, n = 10): Term[] {
  const idx = termIndex(items.filter((i) => i.kind === kind));
  const list = [...idx.values()].filter((t) => t.items.length >= 2 || (idx.size < 20 && t.items.length >= 1 && t.term.includes(" ")));
  list.sort((a, b) => b.items.length - a.items.length || b.groups.size - a.groups.size || (b.term.includes(" ") ? 1 : 0) - (a.term.includes(" ") ? 1 : 0));
  const chosen: Term[] = [];
  for (const t of list) {
    if (chosen.some((c) => (c.term.includes(" ") && c.term.split(" ").includes(t.term) && c.items.length >= t.items.length) || (t.term.includes(" ") && t.term.split(" ").includes(c.term) && c.items.length === t.items.length))) continue;
    chosen.push(t);
    if (chosen.length >= n) break;
  }
  return chosen;
}

/** Concerns raised by at least two different stakeholder groups */
export function sharedConcerns(items: ResponseItem[], n = 8): Term[] {
  return [...termIndex(items.filter((i) => i.kind === "risk")).values()]
    .filter((t) => t.groups.size >= 2)
    .sort((a, b) => b.groups.size - a.groups.size || b.items.length - a.items.length)
    .filter((t, _, arr) => !(t.term.includes(" ") === false && arr.some((o) => o !== t && o.term.includes(" ") && o.term.split(" ").includes(t.term) && o.groups.size >= t.groups.size)))
    .slice(0, n);
}

/** Topics that one group lists as an opportunity while another lists them as a risk */
export function contested(items: ResponseItem[], n = 8) {
  const opp = termIndex(items.filter((i) => i.kind === "opportunity"));
  const risk = termIndex(items.filter((i) => i.kind === "risk"));
  const out: { term: string; opp: ResponseItem[]; risk: ResponseItem[] }[] = [];
  for (const [t, o] of opp) {
    const r = risk.get(t);
    if (!r) continue;
    const differentGroups = [...o.groups].some((g) => [...r.groups].some((h) => h !== g));
    if (differentGroups) out.push({ term: t, opp: o.items, risk: r.items });
  }
  out.sort((a, b) => b.opp.length + b.risk.length - (a.opp.length + a.risk.length));
  return out.filter((x, _, arr) => !(!x.term.includes(" ") && arr.some((o) => o.term.includes(" ") && o.term.split(" ").includes(x.term) && o.opp.length + o.risk.length >= x.opp.length + x.risk.length))).slice(0, n);
}

/** Recommendations using wording no other group used (a hint for "innovative", not a judgement) */
export function distinctive(items: ResponseItem[], n = 6) {
  const all = termIndex(items);
  return items.filter((i) => i.kind === "recommendation").map((i) => {
    const ts = terms(i.text).filter((t) => !t.includes(" "));
    const unique = ts.filter((t) => [...(all.get(t)?.groups ?? [])].every((g) => g === i.group_id));
    return { item: i, score: ts.length ? unique.length / ts.length : 0, unique };
  }).filter((x) => x.unique.length >= 2 && x.score >= 0.5).sort((a, b) => b.score - a.score).slice(0, n);
}
