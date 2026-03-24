import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminShell } from "./admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/login");
  }

  return <AdminShell userName={session.user.name ?? "관리자"}>{children}</AdminShell>;
}
