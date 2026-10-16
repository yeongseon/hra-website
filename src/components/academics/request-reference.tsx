/** 검증된 서버 요청 참조만 한국어로 표시합니다. 기존 오류의 live 영역 안에서 사용합니다. */
import { readAcademicRequestReference } from "@/lib/academic-request-reference";

export function AcademicRequestReference({ referenceId }: { referenceId: unknown }) {
  const reference = readAcademicRequestReference(referenceId);
  return reference ? <p className="break-all text-sm text-[#666666]">요청 참조: {reference}</p> : null;
}
