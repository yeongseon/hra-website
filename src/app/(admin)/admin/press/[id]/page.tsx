import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
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
  const [article] = await db.select().from(pressArticles).where(eq(pressArticles.id, id)).limit(1);

  if (!article) {
    notFound();
  }

  const updateAction = updatePressArticle.bind(null, id);

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
        order: article.order,
      }}
    />
  );
}
