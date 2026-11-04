"use client";
import { createContext, useContext } from "react";
import { useAdminWorkshop } from "@/lib/useAdminWorkshop";

type Ctx = ReturnType<typeof useAdminWorkshop>;
const C = createContext<Ctx | null>(null);

export function WorkshopProvider({ id, children }: { id: string; children: React.ReactNode }) {
  const value = useAdminWorkshop(id);
  return <C.Provider value={value}>{children}</C.Provider>;
}
export function useWs() {
  const v = useContext(C);
  if (!v) throw new Error("useWs outside WorkshopProvider");
  return v;
}
