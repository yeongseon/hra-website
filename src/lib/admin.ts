/**
 * 관리자 권한 확인 유틸리티
 * 
 * 현재 로그인한 사용자가 관리자(ADMIN)인지 확인하는 기능을 제공합니다.
 * 관리자가 아니면 자동으로 로그인 페이지로 이동시킵니다.
 */

// NextAuth의 현재 사용자 세션 정보를 가져오는 함수
import { auth } from "@/lib/auth";
// 사용자를 다른 페이지로 강제로 이동시키는 Next.js 함수
import { redirect } from "next/navigation";

/**
 * 현재 로그인한 사용자가 관리자인지 확인하는 함수
 * 
 * 관리자가 아니면 로그인 페이지로 이동시킵니다.
 * 이 함수는 관리자 페이지에서 권한 확인이 필요할 때 맨 처음에 호출됩니다.
 * 
 * 예: const session = await requireAdmin(); // 관리자 확인 후 진행
 * 
 * @returns {Promise} 관리자의 세션 정보를 반환합니다
 * @throws {redirect} 관리자가 아니면 /login 페이지로 이동
 */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/login");
  }
  return session;
}
