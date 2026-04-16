import type { Metadata } from "next";
import { asc, desc } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { pressArticles } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "언론보도",
};

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

export default async function PressPage() {
  const articles = await db
    .select()
    .from(pressArticles)
    .orderBy(asc(pressArticles.order), desc(pressArticles.publishedAt));

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
      <section className="py-16 text-center sm:py-20">
        <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">
          HRA PRESS
        </Badge>
        <h1 className="mt-4 text-[40px] font-bold leading-tight text-[#1a1a1a]">언론보도</h1>
        <div className="mx-auto mb-3 mt-3 h-1 w-12 bg-[var(--brand)]" />
        <p className="mx-auto mt-5 max-w-3xl text-lg leading-relaxed text-[#666666]">
          HRA가 소개된 언론보도를 모아보았습니다. 다양한 매체에서 전한 HRA의 이야기와 주요 소식을 확인해보세요.
        </p>
      </section>

      {articles.length === 0 ? (
        <div className="rounded-2xl border border-[#D9D9D9] bg-white px-6 py-16 text-center text-base text-[#666666] shadow-[var(--shadow-soft)]">
          등록된 언론보도가 없습니다
        </div>
      ) : (
        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {articles.map((article) => (
            <a
              key={article.id}
              href={article.url}
              target="_blank"
              rel="noreferrer"
              className="group overflow-hidden rounded-2xl border border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] transition-all hover:-translate-y-1 hover:border-blue-400 hover:bg-gray-50"
            >
              {article.imageUrl ? (
                <img
                  src={article.imageUrl}
                  alt={`${article.title} 썸네일`}
                  className="aspect-[16/9] w-full border-b border-[#D9D9D9] object-cover"
                />
              ) : (
                <div className="flex aspect-[16/9] w-full items-center justify-center border-b border-[#D9D9D9] bg-gradient-to-br from-slate-100 via-slate-50 to-white text-sm font-medium text-[#666666]">
                  HRA PRESS
                </div>
              )}

              <div className="flex h-full flex-col p-6">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-blue-600">{article.source}</span>
                  <span className="text-xs text-[#666666]">{formatDate(article.publishedAt)}</span>
                </div>

                <h2 className="mt-3 line-clamp-2 text-xl font-semibold leading-snug text-[#1a1a1a] transition-colors group-hover:text-blue-700">
                  {article.title}
                </h2>

                <p className="mt-4 flex-1 text-sm leading-6 text-[#666666]">
                  {article.description?.trim() || "기사 요약이 등록되지 않았습니다."}
                </p>

                <div className="mt-6 flex items-center gap-2 text-sm font-medium text-[#1a1a1a]">
                  <ExternalLink className="size-4 text-[#666666]" />
                  기사 보러가기
                </div>
              </div>
            </a>
          ))}
        </section>
      )}
    </div>
  );
}
