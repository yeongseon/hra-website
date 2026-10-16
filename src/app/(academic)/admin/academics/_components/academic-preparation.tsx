/** 지정 승인자에게 운영 준비 상태를 안내하며 설정명과 데이터베이스 내부 정보는 표시하지 않는다. */
import Link from "next/link";

export function AcademicPreparation() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">학사관리 준비 중</h1>
      <p>학사관리 기능을 준비하고 있습니다. 준비가 완료되면 이 화면에서 학생 명부를 이용할 수 있습니다.</p>
      <Link href="/mypage" className="text-[#2563EB] underline">마이페이지로 돌아가기</Link>
    </div>
  );
}
