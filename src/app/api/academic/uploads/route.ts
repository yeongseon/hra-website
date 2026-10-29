/**
 * 기존 Web 과제 업로드 API를 공통 SDK 프로토콜 서비스에 연결합니다.
 * 비공개 토큰·서명 영수증의 기존 입력, 오류 상태, 응답 형태를 유지합니다.
 */
import { handleAssignmentUploadProtocol } from "@/features/academics/assignment-uploads/protocol";

export const runtime = "nodejs";

/** 인증·인가·예산·서명 검사는 기존과 동일한 서버 프로토콜에서 수행합니다. */
export async function POST(request: Request): Promise<Response> {
  return handleAssignmentUploadProtocol(request);
}
