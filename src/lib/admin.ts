import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { logServerError } from "@/lib/errors";
import { redirect } from "next/navigation";

export async function requireAdmin(): Promise<Session> {
  let session: Session | null;

  try {
    session = await auth();
  } catch (error) {
    logServerError("admin/requireAdmin", error);
    redirect("/system-error");
  }

  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/login");
  }

  return session;
}
