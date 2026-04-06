import { requireAdmin } from "@/lib/admin";
import { AdminShell } from "./admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();

  return (
    <AdminShell userName={session.user.name ?? "관리자"}>
      {children}
    </AdminShell>
  );
}
