import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "주차별 텍스트",
};

export default function WeeklyTextsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      <div className="mb-8">
        <Link 
          href="/resources" 
          className="inline-flex items-center text-sm font-medium text-[#666666] hover:text-[#1a1a1a] transition-colors"
        >
          <ArrowLeft className="mr-2 size-4" />
          자료실
        </Link>
      </div>

      <section className="mb-10 sm:mb-14 space-y-4 text-center sm:text-left">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-[#1a1a1a]">
          주차별 텍스트
        </h1>
        <p className="max-w-2xl text-sm text-[#666666] md:text-base mx-auto sm:mx-0">
          수업에 필요한 주차별 텍스트 자료를 제공합니다.
        </p>
      </section>

      <section>
        <Card className="border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] rounded-2xl py-10">
          <CardContent className="text-center text-base text-[#666666]">
            등록된 주차별 텍스트가 없습니다.
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
