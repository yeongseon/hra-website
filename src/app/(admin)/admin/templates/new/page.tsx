/** 이전 양식 생성 경로를 자료실의 단일 생성 화면으로 안내합니다. */
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function NewTemplatePage() {
  await requireAdmin();
  redirect("/admin/resources/templates/new");
}
