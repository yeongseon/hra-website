/**
 * 새 공지사항 작성 페이지 (NewNoticePage)
 * 
 * 관리자가 새로운 공지사항을 작성하고 저장하는 페이지입니다.
 * - NoticeForm 컴포넌트에 createNotice 서버 액션을 전달
 * - 사용자가 폼을 작성하고 "공지 저장" 버튼 클릭 시 서버 액션 실행
 * - 저장 완료 후 /admin/notices 목록 페이지로 자동 이동
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NoticeForm } from "@/app/(admin)/admin/notices/_components/notice-form";
import { createNotice } from "@/features/notices/actions";
import { requireAdmin } from "@/lib/admin";

export default async function NewNoticePage() {
  // 관리자 권한 확인 — 비관리자는 자동으로 로그인 페이지로 이동
  await requireAdmin();

  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">새 공지 작성</h1>
        <Button variant="outline" render={<Link href="/admin/notices" />}>
          목록으로
        </Button>
      </div>
      {/* 공지 작성 폼 
          - action: 폼 제출 시 실행할 서버 액션 함수
          - submitLabel: 제출 버튼에 표시할 텍스트
          - successMessage: 성공 시 표시할 메시지
      */}
      <NoticeForm 
        action={createNotice} 
        submitLabel="공지 저장" 
        successMessage="공지사항이 생성되었습니다." 
      />
    </section>
  );
}
