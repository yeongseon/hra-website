/**
 * 자료실 서버 페이지가 DB 조회 전에 로그인·승인 역할을 확인한다 (#100).
 * 개별 기수 자료도 승인 회원에게 열려 있으므로 여기서는 기수로 제한하지 않는다.
 */
import { redirect } from "next/navigation";
import { canReadSharedResource } from "@/features/resources/access";
import { auth } from "@/lib/auth";

export async function requireSharedResourceReader() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canReadSharedResource(session.user.role)) redirect("/pending");
  return session;
}
