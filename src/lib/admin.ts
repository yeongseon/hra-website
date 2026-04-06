import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function requireAdmin(): Promise<Session> {
  let session: Session | null;

  try {
    session = await auth();
  } catch (error) {
    console.error("[admin] 인증 확인 실패:", error);
    redirect("/system-error");
  }

  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/login");
  }

  return session;
}
