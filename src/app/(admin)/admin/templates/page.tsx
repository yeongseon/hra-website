/**
 * 이전 보고서 양식 관리 경로를 자료실의 단일 관리 화면으로 안내합니다.
 * 관리자 인가를 먼저 확인해 이전 경로도 같은 접근 정책을 유지합니다.
 */
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminTemplatesPage() {
  await requireAdmin();
  redirect("/admin/resources/templates");
}
