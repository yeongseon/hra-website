/**
 * 회원 — 보고서 양식 상세 페이지
 *
 * 역할: 양식 본문(Markdown)을 미리 보고, PDF 인쇄 페이지로 이동할 수 있는 진입점.
 *       데이터는 DB → content/ 순으로 자동 조회한다.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkdownViewer } from "@/components/markdown/markdown-viewer";
import { resolveTemplate } from "@/lib/markdown/resolve";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const template = await resolveTemplate(slug);
  return {
    title: template ? template.title : "보고서 양식",
  };
}

export default async function MemberTemplateDetailPage({ params }: Props) {
  const { slug } = await params;
  const template = await resolveTemplate(slug);

  if (!template) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-12 sm:py-20">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" render={<Link href="/member/templates" />}>
          <ArrowLeft className="size-4" />
          목록으로
        </Button>
        <div className="flex gap-2">
          <a href={`/api/templates/${template.slug}/download`} download>
            <Button variant="outline">
              <Download className="size-4" />
              마크다운 다운로드
            </Button>
          </a>
          <Button
            render={<Link href={`/member/templates/${template.slug}/print`} />}
            className="bg-[#1a1a1a] text-white hover:bg-[#333333]"
          >
            <Printer className="size-4" />
            PDF로 저장
          </Button>
        </div>
      </div>

      <header className="mb-8 space-y-3 border-b border-[#D9D9D9] pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="border-[#D9D9D9] bg-white text-[#666666]"
          >
            v{template.version}
          </Badge>
          {template.reportCategory ? (
            <Badge className="bg-blue-100 text-blue-800">
              {template.reportCategory === "management-book"
                ? "경영서"
                : template.reportCategory === "classic-book"
                  ? "고전명작"
                  : "기업실무·한국경제사"}
            </Badge>
          ) : null}
          <span className="text-xs text-[#666666]">
            {template.source === "db" ? "DB 등록 양식" : "기본 시드 양식"}
          </span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-[#1a1a1a]">
          {template.title}
        </h1>
        {template.description ? (
          <p className="text-sm text-[#666666]">{template.description}</p>
        ) : null}
      </header>

      <MarkdownViewer body={template.body} />
    </div>
  );
}
