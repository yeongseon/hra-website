/**
 * 지원서 관리 페이지
 *
 * 역할:
 * - 공개 지원 페이지에서 DB에 저장된 지원서를 관리자 화면에서 조회합니다.
 * - 기수, 지원자 정보, 제출일, 상태를 한 화면에서 확인합니다.
 * - 각 행에서 상태를 바로 변경할 수 있도록 상태 선택 컴포넌트를 연결합니다.
 *
 * 참고:
 * - 공개 지원 폼은 `src/features/applications/actions/submit.ts`에서 DB에 저장됩니다.
 * - 상태 변경은 `src/features/applications/actions/update-status.ts`에서 처리됩니다.
 */

import { desc, eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { applications, cohorts } from "@/lib/db/schema";
import { ApplicationStatusSelect } from "./_components/application-status-select";

export const dynamic = "force-dynamic";

// 제출 시각을 관리자 화면에서 읽기 쉬운 한국어 형식으로 변환합니다.
const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);

// 학교/전공 정보를 한 줄로 합쳐 테이블 셀에서 간결하게 보여줍니다.
const formatAcademicInfo = (university: string | null, major: string | null) => {
  const trimmedUniversity = university?.trim() || null;
  const trimmedMajor = major?.trim() || null;

  if (trimmedUniversity && trimmedMajor) {
    return `${trimmedUniversity} · ${trimmedMajor}`;
  }

  return trimmedUniversity ?? trimmedMajor ?? "-";
};

export default async function AdminApplicationsPage() {
  await requireAdmin();

  // DB 조회 실패를 JSX 밖에서 데이터 객체로 정리해 React lint 규칙을 지킵니다.
  const applicationResult = await db
    .select({
      id: applications.id,
      applicantName: applications.applicantName,
      applicantEmail: applications.applicantEmail,
      applicantPhone: applications.applicantPhone,
      university: applications.university,
      major: applications.major,
      status: applications.status,
      submittedAt: applications.submittedAt,
      cohortName: cohorts.name,
    })
    .from(applications)
    .innerJoin(cohorts, eq(applications.cohortId, cohorts.id))
    .orderBy(desc(applications.submittedAt))
    .then((rows) => ({
      rows,
      hasError: false,
    }))
    .catch((error) => {
      console.error("[admin/applications] DB 조회 오류:", error);

      return {
        rows: [] as Array<{
          id: string;
          applicantName: string;
          applicantEmail: string;
          applicantPhone: string | null;
          university: string | null;
          major: string | null;
          status: "PENDING" | "ACCEPTED" | "REJECTED";
          submittedAt: Date;
          cohortName: string;
        }>,
        hasError: true,
      };
    });

  const { rows, hasError } = applicationResult;

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-10">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">지원서 관리</h1>
        <p className="mt-1 text-sm text-slate-500">
          공개 지원 페이지에서 제출된 DB 기반 지원서를 확인하고 상태를 관리합니다.
        </p>
      </div>

      <Card className="border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-200 py-4">
          <CardTitle className="text-base text-slate-900">전체 지원서 {rows.length}건</CardTitle>
        </CardHeader>
        <CardContent className="py-4">
          {hasError ? (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              지원서를 불러오지 못했습니다. 데이터베이스 연결을 확인해 주세요.
            </div>
          ) : null}

          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>기수</TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead>이메일</TableHead>
                  <TableHead>연락처</TableHead>
                  <TableHead>학교 / 전공</TableHead>
                  <TableHead>제출일</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-slate-500">
                      등록된 지원서가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((application) => (
                    <TableRow key={application.id}>
                      <TableCell className="font-medium text-slate-900">
                        {application.cohortName}
                      </TableCell>
                      <TableCell className="text-slate-700">
                        {application.applicantName}
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate text-slate-700">
                        {application.applicantEmail}
                      </TableCell>
                      <TableCell className="text-slate-700">
                        {application.applicantPhone?.trim() || "-"}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-slate-700">
                        {formatAcademicInfo(application.university, application.major)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-slate-700">
                        {formatDateTime(application.submittedAt)}
                      </TableCell>
                      <TableCell>
                        <ApplicationStatusSelect
                          applicationId={application.id}
                          currentStatus={application.status}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
