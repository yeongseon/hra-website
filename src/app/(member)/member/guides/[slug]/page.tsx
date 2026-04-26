/**
 * 회원 — 가이드 상세 페이지
 *
 * 역할: 보고서 작성 가이드 / 마크다운 가이드 / 제출 가이드 등의 본문(Markdown)을 표시.
 *       데이터 출처는 DB → content/ 순으로 자동 조회한다.
 *
 * URL: /member/guides/[slug]
 *   - report-writing-guide
 *   - markdown-guide
 *   - submission-guide
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkdownViewer } from "@/components/markdown/markdown-viewer";
import { resolveGuide } from "@/lib/markdown/resolve";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const guide = await resolveGuide(slug);
  return {
    title: guide ? guide.title : "가이드",
  };
}

export default async function MemberGuideDetailPage({ params }: Props) {
  const { slug } = await params;
  const guide = await resolveGuide(slug);

  if (!guide) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-12 sm:py-20">
      <div className="mb-6">
        <Button variant="outline" render={<Link href="/resources" />}>
          <ArrowLeft className="size-4" />
          자료실로
        </Button>
      </div>

      <header className="mb-8 space-y-3 border-b border-[#D9D9D9] pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="border-[#D9D9D9] bg-white text-[#666666]"
          >
            v{guide.version}
          </Badge>
          <span className="text-xs text-[#666666]">
            {guide.source === "db" ? "DB 등록 가이드" : "기본 시드 가이드"}
          </span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-[#1a1a1a]">
          {guide.title}
        </h1>
        {guide.description ? (
          <p className="text-sm text-[#666666]">{guide.description}</p>
        ) : null}
      </header>

      <MarkdownViewer body={guide.body} />
    </div>
  );
}
