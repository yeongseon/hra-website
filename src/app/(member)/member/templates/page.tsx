/**
 * 회원 — 보고서 양식 목록 페이지
 *
 * 역할: 회원이 사용할 수 있는 보고서 양식 목록을 표시한다.
 *       각 카드에서 양식 상세로 이동하면 본문(Markdown)을 미리 보고 PDF로 받을 수 있다.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileCheck2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listTemplates } from "@/lib/markdown/resolve";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "보고서 양식",
};

const categoryLabel = (
  code: "management-book" | "classic-book" | "business-practice" | null,
) => {
  switch (code) {
    case "management-book":
      return "경영서";
    case "classic-book":
      return "고전명작";
    case "business-practice":
      return "기업실무·한국경제사";
    default:
      return "기타";
  }
};

export default async function MemberTemplatesPage() {
  const templates = await listTemplates();

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20">
      <section className="mb-10 space-y-4 text-center sm:text-left">
        <Badge
          variant="outline"
          className="border-blue-300 bg-blue-50 text-blue-700"
        >
          HRA TEMPLATES
        </Badge>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-[#1a1a1a]">
          보고서 양식
        </h1>
        <p className="max-w-2xl text-sm text-[#666666] md:text-base mx-auto sm:mx-0">
          분야별 보고서 작성용 표준 양식입니다. 양식을 미리 보고 PDF로 저장하여 사용하세요.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            href="/member/guides/report-writing-guide"
            className="text-[#2563EB] hover:underline"
          >
            작성 가이드 →
          </Link>
          <span className="text-[#D9D9D9]">|</span>
          <Link
            href="/member/guides/markdown-guide"
            className="text-[#2563EB] hover:underline"
          >
            Markdown 문법 →
          </Link>
          <span className="text-[#D9D9D9]">|</span>
          <Link
            href="/member/guides/submission-guide"
            className="text-[#2563EB] hover:underline"
          >
            제출 안내 →
          </Link>
        </div>
      </section>

      {templates.length === 0 ? (
        <Card className="border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] rounded-2xl py-10">
          <CardContent className="text-center text-base text-[#666666]">
            등록된 양식이 없습니다.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Link
              key={template.slug}
              href={`/member/templates/${template.slug}`}
              className="block"
            >
              <Card className="h-full border-[#D9D9D9] bg-white text-[#1a1a1a] shadow-[var(--shadow-soft)] rounded-2xl transition hover:border-blue-400 hover:bg-gray-50">
                <CardHeader className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex size-11 items-center justify-center rounded-full border border-[#D9D9D9] bg-gray-50 text-[#2563EB]">
                      <FileCheck2 className="size-5" />
                    </div>
                    <Badge
                      variant="secondary"
                      className="border border-[#D9D9D9] bg-gray-50 text-[#666666]"
                    >
                      v{template.version}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <Badge
                      variant="outline"
                      className="border-[#D9D9D9] bg-white text-[#666666]"
                    >
                      {categoryLabel(template.reportCategory)}
                    </Badge>
                    <CardTitle className="text-xl">{template.title}</CardTitle>
                  </div>
                  {template.description ? (
                    <CardDescription className="text-sm leading-6 text-[#666666]">
                      {template.description}
                    </CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    className="w-full border-[#D9D9D9] text-[#1a1a1a]"
                  >
                    양식 보기 <ArrowRight className="size-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
