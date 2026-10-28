/**
 * 자료실 — 가이드북 뷰어 페이지
 *
 * 역할: 가이드북 파일(PDF)을 인라인으로 미리보기하고 다운로드 버튼을 제공합니다.
 *       PDF 파일은 iframe으로 임베드, 그 외 파일(HWP/DOCX 등)은 다운로드 안내를 표시합니다.
 *       승인된 MEMBER 이상만 서버 조회 전에 접근을 허용한다.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getGuidebookForReader } from "@/features/guidebooks/member-detail/service";
import { canReadSharedResource } from "@/features/resources/access";
import { auth } from "@/lib/auth";
import { requireSharedResourceReader } from "@/lib/resource-access";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const session = await auth();
  if (!canReadSharedResource(session?.user?.role)) return { title: "가이드북" };
  const { id } = await params;

  // 메타데이터도 같은 서비스의 승인 역할·UUID·표시 필드 정책을 적용합니다.
  const book = await getGuidebookForReader({ id, readerRole: session?.user?.role });
  return {
    title: book ? `${book.title} — 가이드북` : "가이드북",
  };
}

export default async function GuidebookViewerPage({ params }: Props) {
  const session = await requireSharedResourceReader();
  const { id } = await params;

  // 현재 세션의 인가를 먼저 마친 뒤 서비스에서 뷰어 표시 값만 읽습니다.
  const book = await getGuidebookForReader({ id, readerRole: session.user.role });

  if (!book) {
    notFound();
  }

  // 파일 확장자 추출 (소문자)
  const ext = book.fileName.split(".").pop()?.toLowerCase() ?? "";

  // PDF 파일 여부 확인
  const isPdf = ext === "pdf";

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-12 sm:py-20">
      {/* 상단 네비게이션 */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" render={<Link href="/resources?category=가이드북" />}>
          <ArrowLeft className="size-4" />
          목록으로
        </Button>
        <a href={`/api/resources/guidebooks/${book.id}/download`} download={book.fileName}>
          <Button className="bg-[#1a1a1a] text-white hover:bg-[#333333]">
            <Download className="size-4" />
            다운로드
          </Button>
        </a>
      </div>

      {/* 제목 헤더 */}
      <header className="mb-6 border-b border-[#D9D9D9] pb-5">
        <p className="mb-1 text-xs text-[#666666]">가이드북</p>
        <h1 className="text-2xl sm:text-3xl font-semibold text-[#1a1a1a]">{book.title}</h1>
      </header>

      {/* 뷰어 영역 */}
      {isPdf ? (
        // PDF: iframe으로 인라인 미리보기
        <div className="w-full rounded-lg border border-[#D9D9D9] overflow-hidden shadow-[var(--shadow-soft)]">
          <iframe
            src={`/api/resources/guidebooks/${book.id}/download?inline=1#toolbar=1&navpanes=0`}
            className="w-full"
            style={{ height: "80vh", minHeight: "600px" }}
            title={book.title}
          />
        </div>
      ) : (
        // PDF 외 파일: 다운로드 안내
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-[#D9D9D9] bg-gray-50 py-20 text-center">
          <p className="text-[#666666] text-sm">
            이 파일 형식({ext.toUpperCase()})은 브라우저에서 미리볼 수 없습니다.
          </p>
          <p className="text-[#666666] text-sm">다운로드하여 확인해 주세요.</p>
          <a href={`/api/resources/guidebooks/${book.id}/download`} download={book.fileName}>
            <Button className="bg-[#2563EB] text-white hover:bg-blue-700">
              <Download className="size-4" />
              {book.fileName} 다운로드
            </Button>
          </a>
        </div>
      )}
    </div>
  );
}
