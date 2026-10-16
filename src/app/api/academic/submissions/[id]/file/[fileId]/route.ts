/**
 * 개인 최종 제출 파일을 같은 출처의 인증된 첨부 다운로드로만 전달합니다.
 * 동적 경로의 두 ID 외에 URL·저장 키·기수·사용자 입력은 사용하지 않습니다.
 */
import { downloadSubmissionFile, type SubmissionFileParams } from "@/features/academics/submission-files/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<SubmissionFileParams> }): Promise<Response> {
  return downloadSubmissionFile(params);
}
