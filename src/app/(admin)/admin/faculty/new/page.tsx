import { FacultyForm } from "@/app/(admin)/admin/faculty/_components/faculty-form";
import { createFaculty } from "@/features/faculty/actions";
import { requireAdmin } from "@/lib/admin";

export const metadata = { title: "교수진 추가" };

export default async function NewFacultyPage() {
  await requireAdmin();

  return (
    <FacultyForm
      title="교수진 추가"
      description="새로운 교수진 정보를 입력하세요."
      submitLabel="교수진 추가"
      action={createFaculty}
    />
  );
}
