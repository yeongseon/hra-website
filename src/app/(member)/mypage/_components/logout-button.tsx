"use client";

/**
 * 마이페이지 로그아웃 버튼
 *
 * 역할: 마이페이지 "계정 설정" 섹션에서 현재 기기 로그아웃을 처리합니다.
 * 사용 위치: src/app/(member)/mypage/page.tsx
 * 주요 기능: next-auth/react 의 signOut 을 호출해 세션을 종료하고 홈("/")으로 이동.
 *
 * 배경: 기존에는 상단 헤더 메뉴에서만 로그아웃이 가능해, 모바일에서 메뉴바를
 *       열어야 하는 번거로움이 있었습니다. 마이페이지 안에서 바로 로그아웃할 수
 *       있도록 헤더와 동일한 signOut 패턴(header.tsx 참고)을 재사용합니다.
 */

import { useState } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  // 로그아웃 요청 중 버튼 중복 클릭 방지
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    // 세션 종료 후 홈으로 이동 (헤더의 handleSignOut 과 동일한 동작)
    await signOut({ callbackUrl: "/" });
  };

  return (
    <Button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      className="bg-[#1a1a1a] text-white hover:bg-[#333333] w-full sm:w-auto"
    >
      <LogOut className="w-4 h-4 mr-2" />
      {loading ? "로그아웃 중..." : "로그아웃"}
    </Button>
  );
}
