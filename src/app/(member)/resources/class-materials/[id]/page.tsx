/**
 * 자료실 — 강의 자료 뷰어 페이지
 *
 * 역할: 강의 자료 파일을 사이트 내에서 열람하고 다운로드 버튼을 제공합니다.
 *   - PDF: 브라우저 기본 iframe 인라인 뷰어
 *   - PPTX/PPT/DOCX/DOC: Microsoft Office Online 임베드 뷰어
 *     (파일 URL이 공개(public)이어야 동작 — Vercel Blob은 access:"public"이므로 OK)
 *   - HWP: 온라인 뷰어 없음 → 다운로드 안내
 *
 * 접근 권한: 로그인된 MEMBER 이상 (미들웨어로 제어)
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { classMaterials } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  // Oracle Phase D BLOCK 수정 — 검증되지 않은 UUID를 DB에 넘기면 Postgres cast 에러가 원본
  // 그대로 로그에 기록되어 개인정보(라우트 파라미터)가 leak됨. z.uuid() 로 사전 차단.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return { title: "강의 자료" };
  }

  const [material] = await db
    .select({ title: classMaterials.title })
    .from(classMaterials)
    .where(eq(classMaterials.id, parsedId.data))
    .limit(1);
  return {
    title: material ? `${material.title} — 강의 자료` : "강의 자료",
  };
}

export default async function ClassMaterialViewerPage({ params }: Props) {
  const { id } = await params;

  // Oracle Phase D BLOCK 수정 — 라우트 파라미터의 UUID 형식을 먼저 검증.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  const [material] = await db
    .select()
    .from(classMaterials)
    .where(eq(classMaterials.id, parsedId.data))
    .limit(1);

  if (!material) {
    notFound();
  }

  // 파일 확장자 추출
  const ext = material.fileName.split(".").pop()?.toLowerCase() ?? "";

  const isPdf = ext === "pdf";
  // Microsoft Office Online이 지원하는 형식
  const isOfficeViewable = ["pptx", "ppt", "docx", "doc"].includes(ext);

  // Office Online 임베드 URL — 파일 URL은 HTTPS 공개 URL이어야 함
  const officeViewerUrl = isOfficeViewable
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(material.fileUrl)}`
    : null;

  const audienceLabel = material.audience === "FACULTY" ? "교수용" : "학생용";

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-12 sm:py-20">
      {/* 상단 네비게이션 */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" render={<Link href="/resources?category=강의 자료" />}>
          <ArrowLeft className="size-4" />
          목록으로
        </Button>
        <a href={material.fileUrl} download={material.fileName}>
          <Button className="bg-[#1a1a1a] text-white hover:bg-[#333333]">
            <Download className="size-4" />
            다운로드
          </Button>
        </a>
      </div>

      {/* 제목 헤더 */}
      <header className="mb-6 border-b border-[#D9D9D9] pb-5">
        <p className="mb-1 text-xs text-[#666666]">강의 자료 · {audienceLabel}</p>
        <h1 className="text-2xl sm:text-3xl font-semibold text-[#1a1a1a]">{material.title}</h1>
        {(material.weekNumber || material.lectureTitle) && (
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-[#666666]">
            {material.weekNumber ? <span>{material.weekNumber}주차</span> : null}
            {material.lectureTitle ? <span>{material.lectureTitle}</span> : null}
          </div>
        )}
      </header>

      {/* 뷰어 영역 */}
      {isPdf ? (
        // PDF: 브라우저 기본 인라인 뷰어
        <div className="w-full rounded-lg border border-[#D9D9D9] overflow-hidden shadow-[var(--shadow-soft)]">
          <iframe
            src={`${material.fileUrl}#toolbar=1&navpanes=0`}
            className="w-full"
            style={{ height: "80vh", minHeight: "600px" }}
            title={material.title}
          />
        </div>
      ) : officeViewerUrl ? (
        // PPTX/PPT/DOCX/DOC: Microsoft Office Online 임베드 뷰어
        <div className="w-full rounded-lg border border-[#D9D9D9] overflow-hidden shadow-[var(--shadow-soft)]">
          <iframe
            src={officeViewerUrl}
            className="w-full"
            style={{ height: "80vh", minHeight: "600px" }}
            title={material.title}
            // Office Online은 sandbox 제한 없이 동작해야 하므로 allow 설정
            allow="fullscreen"
          />
        </div>
      ) : (
        // HWP 등 온라인 뷰어 불가 형식: 다운로드 안내
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-[#D9D9D9] bg-gray-50 py-20 text-center">
          <p className="text-[#666666] text-sm">
            이 파일 형식({ext.toUpperCase()})은 브라우저에서 미리볼 수 없습니다.
          </p>
          <p className="text-[#666666] text-sm">다운로드하여 확인해 주세요.</p>
          <a href={material.fileUrl} download={material.fileName}>
            <Button className="bg-[#2563EB] text-white hover:bg-blue-700">
              <Download className="size-4" />
              {material.fileName} 다운로드
            </Button>
          </a>
        </div>
      )}
    </div>
  );
}
