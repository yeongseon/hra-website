/**
 * 관리자 페이지 레이아웃 (AdminLayout)
 * 
 * 이 파일은 /admin 으로 시작하는 모든 페이지에 적용되는 레이아웃입니다.
 * - 관리자 권한 확인 (인증 보안)
 * - 관리자 사이드바 쉘(AdminShell) 제공
 * - 하위 페이지들이 AdminShell 컴포넌트 안에 렌더링됨
 */

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminShell } from "./admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 현재 사용자의 세션 정보 조회 (로그인한 사용자가 누구인지 확인)
  const session = await auth();

  // 관리자 권한 확인 — 로그인하지 않았거나 관리자가 아니면
  // 자동으로 로그인 페이지(/login)로 이동
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/login");
  }

  // 관리자 권한이 있으면, AdminShell로 감싼 뒤 페이지 렌더링
  // 사용자 이름을 props로 전달
  return <AdminShell userName={session.user.name ?? "관리자"}>{children}</AdminShell>;
}
