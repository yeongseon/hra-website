import { PressForm } from "@/app/(admin)/admin/press/_components/press-form";
import { createPressArticle } from "@/features/press/actions";
import { requireAdmin } from "@/lib/admin";

export default async function NewPressArticlePage() {
  await requireAdmin();

  return (
    <PressForm
      title="새 언론보도 추가"
      description="새로운 언론보도 기사를 입력하세요."
      submitLabel="언론보도 추가"
      action={createPressArticle}
    />
  );
}
