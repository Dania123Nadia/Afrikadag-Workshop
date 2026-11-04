import { Info, Target, TriangleAlert, UserSquare2 } from "lucide-react";
import { GroupBadge } from "./GroupIcon";
import type { StakeholderGroup } from "@/lib/types";

export function StakeholderCard({ group, tables, reveal = false }: { group: StakeholderGroup; tables?: number[]; reveal?: boolean }) {
  return (
    <article className={`card overflow-hidden ${reveal ? "animate-pop" : ""}`}>
      <div className="flex items-center gap-4 p-5" style={{ background: `linear-gradient(135deg, ${group.color}14, transparent 70%)` }}>
        <GroupBadge name={group.name} color={group.color} icon={group.icon} size="lg" />
        <div className="min-w-0">
          <p className="eyebrow">Your stakeholder role</p>
          <h2 className="text-xl font-extrabold leading-tight">{group.name}</h2>
          {tables && tables.length > 0 && <p className="mt-0.5 text-sm text-muted">Tables {tables.join(", ")}</p>}
        </div>
      </div>
      <div className="space-y-4 px-5 pb-5 pt-1">
        <Row icon={UserSquare2} title="Who you are">{group.who}</Row>
        <Row icon={Target} title="What you want">{group.interests}</Row>
        <Row icon={TriangleAlert} title="What worries you">{group.concerns}</Row>
        {group.illustrative && (
          <p className="flex items-start gap-2 rounded-xl bg-surface px-3 py-2 text-xs text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Illustrative profile for this exercise. It does not represent the official position of any real organisation.
          </p>
        )}
      </div>
    </article>
  );
}

function Row({ icon: I, title, children }: { icon: typeof Info; title: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="flex gap-3">
      <I className="mt-0.5 h-4.5 w-4.5 shrink-0 text-muted" />
      <div>
        <h3 className="text-sm font-bold">{title}</h3>
        <p className="mt-0.5 text-[15px] leading-relaxed">{children}</p>
      </div>
    </div>
  );
}
