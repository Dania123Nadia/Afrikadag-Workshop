import { AdminGate } from "@/components/admin/AdminGate";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata = { title: "Facilitator · Afrikadag Workshop" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider><AdminGate>{children}</AdminGate></ToastProvider>;
}
