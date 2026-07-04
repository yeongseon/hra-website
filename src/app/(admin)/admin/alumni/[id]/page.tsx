import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod/v4";
import { AlumniStoryForm } from "@/app/(admin)/admin/alumni/_components/alumni-story-form";
import { updateAlumniStory } from "@/features/alumni/actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { alumniStories } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type EditAlumniStoryPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditAlumniStoryPage({ params }: EditAlumniStoryPageProps) {
  await requireAdmin();

  const { id } = await params;

  // Oracle Phase D BLOCK 수정 — z.uuid() 사전 검증으로 라우트 파라미터 leak 방지.
  // UUID 형식이 아닌 값이 DB 쿼리에 도달하면 Postgres cast error 로 raw ID 가
  // Vercel Logs 에 노출될 수 있으므로 사전 차단한다.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  const story = await db.query.alumniStories.findFirst({
    where: eq(alumniStories.id, parsedId.data),
  });

  if (!story) {
    notFound();
  }

  const updateAction = updateAlumniStory.bind(null, parsedId.data);

  return (
    <AlumniStoryForm
      title="수료생 이야기 수정"
      description={`${story.name} 수료생 이야기를 수정합니다.`}
      submitLabel="변경사항 저장"
      action={updateAction}
      defaultValues={{
        name: story.name,
        title: story.title,
        quote: story.quote,
        content: story.content,
        isFeatured: story.isFeatured,
      }}
    />
  );
}
