"use client";
import { X } from "lucide-react";
import { useEffect } from "react";

export function Drawer({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" aria-label="Close" onClick={onClose} />
      <div className={`relative flex h-full w-full ${wide ? "max-w-3xl" : "max-w-lg"} animate-[rise_.3s_ease-out] flex-col bg-surface shadow-2xl`}>
        <div className="flex items-center justify-between gap-3 border-b border-line bg-white px-5 py-4">
          <div className="min-w-0 flex-1">{title}</div>
          <button className="btn-ghost !p-2" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
