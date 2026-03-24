/**
 * 공지사항 수정 페이지 (NoticeEditPage)
 * 
 * 관리자가 기존 공지사항을 수정하는 페이지입니다.
 * - URL 매개변수 [id]에서 공지사항 ID 추출
 * - DB에서 해당 ID의 공지사항 데이터 조회
 * - NoticeForm에 기존 데이터를 defaultValues로 전달해 폼에 미리 채움
 * - 사용자가 수정 후 "수정 저장" 버튼 클릭 시 updateNotice 서버 액션 실행
 * - 저장 완료 후 /admin/notices 목록 페이지로 자동 이동
 */

import Link from "next/link";
import { eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NoticeForm } from "@/app/(admin)/admin/notices/_components/notice-form";
import { updateNotice } from "@/features/notices/actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { notices } from "@/lib/db/schema";

// 캐시 비활성화 — 매번 새로운 데이터를 조회
export const dynamic = "force-dynamic";

type NoticeEditPageProps = {
  params: Promise<{ id: string }>;
};

export default async function NoticeEditPage({ params }: NoticeEditPageProps) {
  // 관리자 권한 확인 — 비관리자는 자동으로 로그인 페이지로 이동
  await requireAdmin();

  // URL 매개변수에서 공지사항 ID 추출
  const { id } = await params;
  
  // DB 조회: 해당 ID의 공지사항 데이터 가져오기
  // where(eq(notices.id, id)) — id가 일치하는 행만 선택
  // limit(1) — 최대 1개 행만 반환 (중복 방지)
  const [notice] = await db
    .select({
      id: notices.id,
      title: notices.title,
      content: notices.content,
      status: notices.status,
      pinned: notices.pinned,
    })
    .from(notices)
    .where(eq(notices.id, id))
    .limit(1);

  // 공지사항을 찾을 수 없으면 에러 메시지 표시
  if (!notice) {
    return (
      <section className="mx-auto max-w-4xl px-6 py-10">
        <Card className="border-slate-200 bg-white">
          <CardContent className="py-10 text-center text-slate-600">
            공지사항을 찾을 수 없습니다.
          </CardContent>
        </Card>
      </section>
    );
  }

  // updateNotice 서버 액션에 공지사항 ID를 미리 바인딩
  // bind() — 함수의 첫 번째 인자를 고정하는 JavaScript 메서드
  // 이렇게 하면 폼 제출 시 자동으로 이 ID가 updateNotice에 전달됨
  const action = updateNotice.bind(null, notice.id);

  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">공지 수정</h1>
        <Button variant="outline" render={<Link href="/admin/notices" />}>
          목록으로
        </Button>
      </div>
      {/* 공지 수정 폼
          - action: updateNotice (ID가 미리 바인딩됨)
          - defaultValues: DB에서 조회한 기존 데이터를 폼에 미리 표시
          - submitLabel, successMessage: 새 공지사항과 다른 텍스트 사용
      */}
      <NoticeForm
        action={action}
        defaultValues={{
          title: notice.title,
          content: notice.content,
          status: notice.status,
          pinned: notice.pinned,
        }}
        submitLabel="수정 저장"
        successMessage="공지사항이 수정되었습니다."
      />
    </section>
  );
}
