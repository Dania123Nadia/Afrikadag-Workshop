"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { Loader2, LockKeyhole, LogOut } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { adminDb } from "@/lib/supabase";
import { BrandMark } from "@/components/ui/Brand";

const Ctx = createContext<{ session: Session | null; signOut: () => void }>({ session: null, signOut: () => {} });
export const useAdmin = () => useContext(Ctx);

/** Password-protected facilitator area. Data access is also enforced by RLS in the database. */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const db = adminDb();
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<"checking" | "out" | "denied" | "in">("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function check(s: Session | null) {
    setSession(s);
    if (!s || s.user.is_anonymous) { setState("out"); return; }
    const { data, error } = await db.rpc("is_admin");
    setCheckError(error ? `${error.code ?? ""} ${error.message}`.trim() : null);
    setState(data ? "in" : "denied");
  }
  useEffect(() => {
    db.auth.getSession().then(({ data }) => check(data.session));
    const { data: sub } = db.auth.onAuthStateChange((ev, s) => { if (ev === "SIGNED_OUT") check(null); else if (ev === "SIGNED_IN") check(s); });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { setErr("Incorrect e-mail or password."); return; }
    await check(data.session);
  }
  const signOut = async () => { await db.auth.signOut(); setState("out"); };

  if (state === "checking") return <div className="flex min-h-dvh items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>;
  if (state !== "in") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-ink p-5">
        <div className="card w-full max-w-sm animate-rise p-6">
          <div className="flex items-center gap-3"><BrandMark className="h-10 w-10" /><div><p className="eyebrow">Afrikadag</p><h1 className="text-lg font-extrabold">Facilitator sign-in</h1></div></div>
          {state === "denied" ? (
            <div className="mt-5 space-y-3">
              {checkError ? (
                <p className="rounded-xl bg-stop-soft px-3 py-2.5 text-sm text-stop">Signed in as {session?.user.email}, but the facilitator check failed: <span className="font-mono">{checkError}</span>. The database setup may be incomplete.</p>
              ) : (
                <p className="rounded-xl bg-caution-soft px-3 py-2.5 text-sm text-caution">Signed in as {session?.user.email}, but this account is not a facilitator yet. Add it with <span className="font-mono">select public.grant_admin('{session?.user.email}');</span> in the Supabase SQL editor, then sign out and in again.</p>
              )}
              <button className="btn-secondary w-full" onClick={signOut}><LogOut className="h-4 w-4" /> Sign out</button>
            </div>
          ) : (
            <form onSubmit={signIn} className="mt-5 space-y-3">
              <div><label className="label" htmlFor="em">E-mail</label><input id="em" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div><label className="label" htmlFor="pw">Password</label><input id="pw" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
              {err && <p className="text-sm font-medium text-stop">{err}</p>}
              <button className="btn-primary w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />} Sign in</button>
            </form>
          )}
        </div>
      </main>
    );
  }
  return <Ctx.Provider value={{ session, signOut }}>{children}</Ctx.Provider>;
}
