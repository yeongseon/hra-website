import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { FacultyForm } from "@/app/(admin)/admin/faculty/_components/faculty-form";
import { updateFaculty } from "@/features/faculty/actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { faculty } from "@/lib/db/schema";

export const metadata = { title: "교수진 수정" };

export const dynamic = "force-dynamic";

type EditFacultyPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditFacultyPage({ params }: EditFacultyPageProps) {
  await requireAdmin();

  const { id } = await params;
  const [facultyMember] = await db.select().from(faculty).where(eq(faculty.id, id)).limit(1);

  if (!facultyMember) {
    notFound();
  }

  const updateAction = updateFaculty.bind(null, id);

  return (
    <FacultyForm
      title="교수진 수정"
      description={`${facultyMember.name} 정보를 수정합니다.`}
      submitLabel="변경사항 저장"
      action={updateAction}
      defaultValues={{
        name: facultyMember.name,
        category: facultyMember.category,
        currentPosition: facultyMember.currentPosition,
        formerPosition: facultyMember.formerPosition,
        imageUrl: facultyMember.imageUrl,
        order: facultyMember.order,
      }}
    />
  );
}
