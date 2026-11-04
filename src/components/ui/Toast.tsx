"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { Bell, CheckCircle2, Info, AlertTriangle } from "lucide-react";

type Tone = "info" | "success" | "warn" | "stage";
interface T { id: number; title: string; body?: string; tone: Tone }
const Ctx = createContext<(title: string, body?: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<T[]>([]);
  const push = useCallback((title: string, body?: string, tone: Tone = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...(tone === "stage" ? t.filter((x) => x.tone !== "stage") : t).slice(-2), { id, title, body, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "stage" ? 6000 : 4500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3" aria-live="assertive">
        {toasts.map((t) => {
          const I = t.tone === "success" ? CheckCircle2 : t.tone === "warn" ? AlertTriangle : t.tone === "stage" ? Bell : Info;
          return (
            <div key={t.id} className={`pointer-events-auto flex w-full max-w-md animate-pop items-start gap-3 rounded-2xl px-4 py-3 shadow-xl ${t.tone === "stage" ? "bg-ink text-white" : "border border-line bg-white text-ink"}`}>
              <I className={`mt-0.5 h-5 w-5 shrink-0 ${t.tone === "success" ? "text-go" : t.tone === "warn" ? "text-caution" : t.tone === "stage" ? "text-accent" : "text-brand"}`} />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{t.title}</p>
                {t.body && <p className={`mt-0.5 text-sm ${t.tone === "stage" ? "text-white/75" : "text-ink-2"}`}>{t.body}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);
