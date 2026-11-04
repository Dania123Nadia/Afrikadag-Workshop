"use client";
import { use } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, BarChart3, LayoutDashboard, MonitorPlay, Radio, Settings2 } from "lucide-react";
import { WorkshopProvider, useWs } from "@/components/admin/WorkshopContext";
import { BrandMark } from "@/components/ui/Brand";

export default function Layout({ params, children }: { params: Promise<{ id: string }>; children: React.ReactNode }) {
  const { id } = use(params);
  return <WorkshopProvider id={id}><Shell id={id}>{children}</Shell></WorkshopProvider>;
}

function Shell({ id, children }: { id: string; children: React.ReactNode }) {
  const path = usePathname();
  const { workshop, live, loading, error } = useWs();
  if (path.endsWith("/present")) return <>{children}</>;
  const tabs = [
    { href: `/admin/w/${id}`, label: "Live dashboard", icon: LayoutDashboard },
    { href: `/admin/w/${id}/insights`, label: "Insights", icon: BarChart3 },
    { href: `/admin/w/${id}/present`, label: "Presentation", icon: MonitorPlay },
    { href: `/admin/w/${id}/setup`, label: "Setup", icon: Settings2 },
  ];
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3 lg:px-6">
          <Link href="/admin" className="btn-ghost !p-2" aria-label="All workshops"><ArrowLeft className="h-4 w-4" /></Link>
          <BrandMark className="h-8 w-8" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[15px] font-bold text-ink">{workshop?.title ?? (loading ? "Loading…" : error)}</p>
            <p className="text-xs text-muted">Code <span className="font-mono font-bold text-ink">{workshop?.access_code}</span></p>
          </div>
          <span className={`chip ${live ? "bg-go-soft text-go" : "bg-caution-soft text-caution"}`}><Radio className={`h-3.5 w-3.5 ${live ? "animate-pulse-soft" : ""}`} />{live ? "Real-time connected" : "Reconnecting…"}</span>
        </div>
        <nav className="no-scrollbar mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-4 lg:px-6">
          {tabs.map((t) => {
            const active = path === t.href;
            const I = t.icon;
            return (
              <Link key={t.href} href={t.href} className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition ${active ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"}`}>
                <I className="h-4 w-4" />{t.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-5 lg:px-6">{children}</main>
    </div>
  );
}
