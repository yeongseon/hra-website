import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod/v4";
import { PressForm } from "@/app/(admin)/admin/press/_components/press-form";
import { updatePressArticle } from "@/features/press/actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { pressArticles } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type EditPressArticlePageProps = {
  params: Promise<{ id: string }>;
};

function toDateInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

export default async function EditPressArticlePage({ params }: EditPressArticlePageProps) {
  await requireAdmin();

  const { id } = await params;

  // Oracle Phase D BLOCK 수정 — z.uuid() 사전 검증으로 라우트 파라미터 leak 방지.
  // UUID 형식이 아닌 값이 DB 쿼리에 도달하면 Postgres cast error 로 raw ID 가
  // Vercel Logs 에 노출될 수 있으므로 사전 차단한다.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  const [article] = await db.select().from(pressArticles).where(eq(pressArticles.id, parsedId.data)).limit(1);

  if (!article) {
    notFound();
  }

  const updateAction = updatePressArticle.bind(null, parsedId.data);

  return (
    <PressForm
      title="언론보도 수정"
      description={`${article.source} 기사 정보를 수정합니다.`}
      submitLabel="변경사항 저장"
      action={updateAction}
      defaultValues={{
        title: article.title,
        source: article.source,
        url: article.url,
        publishedAt: toDateInputValue(article.publishedAt),
        description: article.description,
        imageUrl: article.imageUrl,
      }}
    />
  );
}
