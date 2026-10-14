/**
 * 회원 페이지의 서버 인가 헬퍼입니다 (#123).
 * 레이아웃과 개별 페이지가 같은 승인 역할 정책을 검사하고,
 * 데이터 조회 전에 미로그인·승인 대기 사용자를 이동시킵니다.
 */
import type { Session } from "next-auth";
import { redirect } from "next/navigation";
import { canReadSharedResource } from "@/features/resources/access";
import { auth } from "@/lib/auth";
import { logServerError } from "@/lib/errors";

export async function requireMember(): Promise<Session> {
  let session: Session | null;

  try {
    session = await auth();
  } catch (error) {
    logServerError("member/requireMember", error);
    redirect("/system-error");
  }

  if (!session?.user) redirect("/login");
  if (!canReadSharedResource(session.user.role)) redirect("/pending");
  return session;
}
