/** 학사 과제의 저장 구조가 준비되기 전에는 수치를 추정하지 않고 준비 상태만 안내한다. */
import Link from "next/link";
export function AssignmentPreparation() {
  return <div className="space-y-4">
    <h1 className="text-3xl font-bold">과제 관리 준비 중</h1>
    <p>과제 관리 기능을 준비하고 있습니다. 준비가 완료되면 과제와 실제 대상·제출 현황을 확인할 수 있습니다.</p>
    <Link href="/mypage" className="text-[#2563EB] underline">마이페이지로 돌아가기</Link>
  </div>;
}
