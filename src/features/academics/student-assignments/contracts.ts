/**
 * 학생 과제 조회의 명시적 응답 타입이다.
 * 클라이언트에는 자기 과제·최종 제출 메타만 전달하고 저장 키·URL·계정·학적 식별자를 포함하지 않는다.
 */

// 학생 상세 경로와 업로드 액션이 선택할 수 있는 식별자 종류다. 소유권은 서버 DB 조인으로 다시 확인한다.
export type AssignmentTargetSelector = { assignmentId: string } | { targetId: string };
export type StudentAssignmentStatus = "PUBLISHED" | "CLOSED";

// 목록은 파일 식별자를 포함하지 않고 최종 제출 여부와 시각만 보여준다.
export interface StudentAssignmentSummary {
  assignmentId: string;
  targetId: string;
  title: string;
  status: StudentAssignmentStatus;
  dueAt: string;
  publishedAt: string;
  submission: { submittedAt: string } | null;
}

// 상세에서도 해당 학생의 파일 메타만 제공한다. 실제 다운로드는 별도 서버 인가를 거친다.
export interface StudentAssignmentDetail extends StudentAssignmentSummary {
  instructions: string;
  file: { fileId: string; originalName: string; mimeType: string; sizeBytes: number } | null;
}

export interface StudentAssignmentPage {
  items: StudentAssignmentSummary[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
}

// 신뢰할 수 있는 서버 모듈끼리만 사용하는 일회성 조회 결과다. 직렬화해 권한 증명으로 재사용하지 않는다.
export interface AuthorizedAssignmentTarget {
  userId: string;
  assignmentId: string;
  targetId: string;
  status: StudentAssignmentStatus;
  dueAt: Date;
  publishedAt: Date;
}
