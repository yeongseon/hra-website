import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
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
  const [story] = await db.select().from(alumniStories).where(eq(alumniStories.id, id)).limit(1);

  if (!story) {
    notFound();
  }

  const updateAction = updateAlumniStory.bind(null, id);

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
        imageUrl: story.imageUrl,
        order: story.order,
      }}
    />
  );
}
