/**
 * 관리자 모집 설정의 서버 진입점입니다 (#123).
 * 클라이언트 화면을 렌더링하기 전에 관리자 역할을 확인합니다.
 */
import { requireAdmin } from "@/lib/admin";
import { RecruitmentSettingsClient } from "./_components/recruitment-settings-client";

export const dynamic = "force-dynamic";

export default async function AdminRecruitmentSettingsPage() {
  await requireAdmin();
  return <RecruitmentSettingsClient />;
}
