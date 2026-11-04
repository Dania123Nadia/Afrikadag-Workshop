"use client";
import { useMemo, useState } from "react";
import { Info, Lightbulb, Sparkles, Swords, Users2 } from "lucide-react";
import { useWs } from "@/components/admin/WorkshopContext";
import { ItemCurate } from "@/components/admin/ItemCurate";
import { GroupBadge } from "@/components/ui/GroupIcon";
import { Drawer } from "@/components/ui/Drawer";
import { ITEM_META } from "@/lib/content";
import { contested, distinctive, sharedConcerns, topTerms, type Term } from "@/lib/insights";
import type { ItemKind, ResponseItem } from "@/lib/types";

export default function Insights() {
  const { items, groups, fields, progress } = useWs();
  const [detail, setDetail] = useState<{ title: string; items: ResponseItem[] } | null>(null);
  const gName = (id: string) => groups.find((g) => g.id === id)?.name ?? "";

  const top = useMemo(() => ({
    opportunity: topTerms(items, "opportunity"),
    risk: topTerms(items, "risk"),
    recommendation: topTerms(items, "recommendation"),
  }), [items]);
  const shared = useMemo(() => sharedConcerns(items), [items]);
  const conflicts = useMemo(() => contested(items), [items]);
  const unique = useMemo(() => distinctive(items), [items]);
  const flagged = (f: string) => items.filter((i) => i.flag === f);

  const TermList = ({ list, kind }: { list: Term[]; kind: ItemKind }) => {
    const max = Math.max(1, ...list.map((t) => t.items.length));
    if (!list.length) return <p className="text-sm text-muted">Not enough input yet. Terms appear once mentioned at least twice.</p>;
    return (
      <ul className="space-y-1.5">
        {list.map((t) => (
          <li key={t.term}>
            <button className="group w-full text-left" onClick={() => setDetail({ title: `“${t.term}” in ${ITEM_META[kind].label.toLowerCase()}`, items: t.items })}>
              <div className="flex items-baseline justify-between gap-2 text-sm"><span className="font-semibold text-ink group-hover:underline">{t.term}</span><span className="text-xs tabular-nums text-muted">{t.items.length}× · {t.groups.size} group{t.groups.size > 1 ? "s" : ""}</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-surface"><div className="h-full rounded-full transition-all" style={{ width: `${(t.items.length / max) * 100}%`, background: ITEM_META[kind].color }} /></div>
            </button>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="space-y-5">
      <p className="flex items-start gap-2 rounded-2xl bg-white px-4 py-3 text-sm ring-1 ring-line">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <span><strong className="text-ink">How this works:</strong> automatic word and phrase counts across all live group input. No AI is used and nothing is interpreted. Click any term to read the original responses. Tag items (insight, innovative, disagreement) and star them for the presentation.</span>
      </p>

      <section className="grid gap-4 lg:grid-cols-3">
        {(["opportunity", "risk", "recommendation"] as const).map((k) => (
          <div key={k} className="card p-4">
            <h2 className="text-sm font-bold" style={{ color: ITEM_META[k].color }}>Most mentioned {ITEM_META[k].label.toLowerCase()}</h2>
            <p className="mb-3 text-xs text-muted">{items.filter((i) => i.kind === k).length} items in total</p>
            <TermList list={top[k]} kind={k} />
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><Users2 className="h-4 w-4 text-stop" />Common concerns across stakeholder groups</h2>
          <p className="mb-3 text-xs text-muted">Risk terms used by two or more different groups.</p>
          {shared.length === 0 ? <p className="text-sm text-muted">None yet.</p> : (
            <ul className="space-y-2">{shared.map((t) => (
              <li key={t.term}><button className="w-full rounded-xl bg-stop-soft/60 px-3 py-2 text-left hover:bg-stop-soft" onClick={() => setDetail({ title: `Shared concern: “${t.term}”`, items: t.items })}>
                <span className="font-semibold text-ink">{t.term}</span>
                <span className="mt-1 flex flex-wrap gap-1">{[...t.groups].map((g) => <span key={g} className="chip bg-white !py-0.5 text-[11px] text-ink-2">{gName(g)}</span>)}</span>
              </button></li>
            ))}</ul>
          )}
        </div>
        <div className="card p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><Swords className="h-4 w-4 text-caution" />Conflicting perspectives</h2>
          <p className="mb-3 text-xs text-muted">Topics one group lists as an <span style={{ color: "var(--color-go)" }}>opportunity</span> and another as a <span style={{ color: "var(--color-stop)" }}>risk</span>.</p>
          {conflicts.length === 0 ? <p className="text-sm text-muted">None detected yet.</p> : (
            <ul className="space-y-2">{conflicts.map((c) => (
              <li key={c.term}><button className="w-full rounded-xl bg-caution-soft/60 px-3 py-2 text-left hover:bg-caution-soft" onClick={() => setDetail({ title: `Contested: “${c.term}”`, items: [...c.opp, ...c.risk] })}>
                <span className="font-semibold text-ink">{c.term}</span>
                <span className="mt-1 block text-xs"><span className="font-semibold text-go">Opportunity:</span> {[...new Set(c.opp.map((i) => gName(i.group_id)))].join(", ")} · <span className="font-semibold text-stop">Risk:</span> {[...new Set(c.risk.map((i) => gName(i.group_id)))].join(", ")}</span>
              </button></li>
            ))}</ul>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><Sparkles className="h-4 w-4 text-brand" />Innovative recommendations</h2>
          <p className="mb-3 text-xs text-muted">Tagged by facilitators, plus suggestions using wording no other group used (a hint, not a judgement).</p>
          <div className="space-y-1.5">
            {flagged("innovative").map((i) => <ItemCurate key={i.id} item={i} groupName={gName(i.group_id)} showKind />)}
            {unique.filter((u) => u.item.flag !== "innovative").map((u) => <ItemCurate key={u.item.id} item={u.item} groupName={`${gName(u.item.group_id)} · distinctive wording`} showKind />)}
            {flagged("innovative").length + unique.length === 0 && <p className="text-sm text-muted">Nothing yet.</p>}
          </div>
        </div>
        <div className="card p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><Swords className="h-4 w-4 text-caution" />Points of disagreement & <Lightbulb className="h-4 w-4 text-caution-fill" />insights</h2>
          <p className="mb-3 text-xs text-muted">Items you tagged in the dashboard or here.</p>
          <div className="space-y-1.5">
            {[...flagged("disagreement"), ...flagged("insight")].map((i) => <ItemCurate key={i.id} item={i} groupName={gName(i.group_id)} showKind />)}
            {flagged("disagreement").length + flagged("insight").length === 0 && <p className="text-sm text-muted">Nothing tagged yet.</p>}
          </div>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-bold text-ink">Key takeaways side by side</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => {
            const t = fields.find((f) => f.group_id === g.id && f.field === "key_takeaway")?.content;
            const st = progress.find((p) => p.group_id === g.id)?.status;
            return (
              <div key={g.id} className="rounded-xl bg-surface p-3">
                <div className="flex items-center gap-2"><GroupBadge name={g.name} color={g.color} icon={g.icon} size="sm" /><span className="text-sm font-bold text-ink">{g.name}</span><span className="ml-auto text-[11px] text-muted">{st === "submitted" ? "submitted" : "draft"}</span></div>
                <p className={`mt-2 text-sm ${t ? "text-ink" : "italic text-muted"}`}>{t || "Not written yet"}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-bold text-ink">All original responses</h2>
        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          {(["opportunity", "risk", "recommendation"] as const).map((k) => (
            <div key={k} className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: ITEM_META[k].color }}>{ITEM_META[k].label}</p>
              {items.filter((i) => i.kind === k).map((i) => <ItemCurate key={i.id} item={i} groupName={gName(i.group_id)} />)}
            </div>
          ))}
        </div>
      </section>

      <Drawer open={!!detail} onClose={() => setDetail(null)} title={<p className="font-bold text-ink">{detail?.title}</p>}>
        <p className="mb-3 text-xs text-muted">Original participant responses ({detail?.items.length}).</p>
        <div className="space-y-1.5">{detail?.items.map((i) => <ItemCurate key={i.id} item={items.find((x) => x.id === i.id) ?? i} groupName={gName(i.group_id)} showKind />)}</div>
      </Drawer>
    </div>
  );
}
