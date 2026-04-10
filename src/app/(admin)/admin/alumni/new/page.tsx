import { AlumniStoryForm } from "@/app/(admin)/admin/alumni/_components/alumni-story-form";
import { createAlumniStory } from "@/features/alumni/actions";
import { requireAdmin } from "@/lib/admin";

export default async function NewAlumniStoryPage() {
  await requireAdmin();

  return (
    <AlumniStoryForm
      title="새 수료생 이야기 추가"
      description="새로운 수료생 이야기를 입력하세요."
      submitLabel="수료생 이야기 추가"
      action={createAlumniStory}
    />
  );
}
