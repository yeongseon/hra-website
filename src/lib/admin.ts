/** 관리자 화면·액션의 세션과 ADMIN 역할을 검사하고 인증 오류 시 안전하게 이동합니다. */
import type { Session } from "next-auth";
import { getRequestSession } from "@/lib/request-session";
import { logServerError } from "@/lib/errors";
import { redirect } from "next/navigation";

// 세션 조회를 공유하더라도 호출 위치마다 관리자 역할을 다시 검사합니다.
export async function requireAdmin(): Promise<Session> {
  let session: Session | null;

  try {
    session = await getRequestSession();
  } catch (error) {
    logServerError("admin/requireAdmin", error);
    redirect("/system-error");
  }

  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/login");
  }

  return session;
}
