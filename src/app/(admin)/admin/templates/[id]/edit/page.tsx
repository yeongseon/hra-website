/** 이전 양식 수정 경로의 관리자 인가와 ID 검증을 유지한 채 단일 화면으로 안내합니다. */
import { notFound, redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export default async function EditTemplatePage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) notFound();
  redirect(`/admin/resources/templates/${parsedId.data}/edit`);
}
