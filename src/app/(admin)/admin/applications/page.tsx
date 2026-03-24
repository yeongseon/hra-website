/**
 * 지원서 관리 페이지 (AdminApplicationsPage)
 * 
 * 관리자가 접수된 모든 지원서를 확인하는 페이지입니다.
 * - DB에서 지원서 데이터 조회 (지원자명, 이메일, 전화, 대학교, 전공 등)
 * - 테이블 형식으로 모든 지원서 목록 표시
 * - 각 행의 "보기" 버튼으로 상세 내용을 모달 대화상자로 표시
 * - 지원서는 읽기 전용 (생성/수정/삭제 불가)
 */

import { desc, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { applications, cohorts } from "@/lib/db/schema";

// 캐시 비활성화 — 매번 새로운 데이터를 조회
export const dynamic = "force-dynamic";

/**
 * 날짜와 시간을 한국어 형식으로 포맷하는 함수
 * 예: 2024-12-25 15:30 형식으로 표시
 */
const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);

export default async function AdminApplicationsPage() {
  // 관리자 권한 확인 — 비관리자는 자동으로 로그인 페이지로 이동
  await requireAdmin();

  // DB 조회: 지원서 테이블에서 필요한 데이터 가져오기
  // - SELECT: 지원자 정보, 지원 동기, 추가 정보 등
  // - FROM applications: applications 테이블에서
  // - innerJoin cohorts: 지원한 기수 정보를 cohorts 테이블에서 가져오기
  // - orderBy: 최신 지원서 순으로 정렬
  const rows = await db
    .select({
      id: applications.id,
      applicantName: applications.applicantName,
      applicantEmail: applications.applicantEmail,
      applicantPhone: applications.applicantPhone,
      university: applications.university,
      major: applications.major,
      motivation: applications.motivation,
      additionalInfo: applications.additionalInfo,
      submittedAt: applications.submittedAt,
      cohortName: cohorts.name,
    })
    .from(applications)
    .innerJoin(cohorts, eq(applications.cohortId, cohorts.id))
    .orderBy(desc(applications.submittedAt));

  return (
    <section className="mx-auto max-w-7xl px-6 py-10">
      {/* 페이지 제목 */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">지원서 관리</h1>
        <p className="mt-1 text-sm text-slate-500">접수된 지원서를 확인할 수 있습니다. (읽기 전용)</p>
      </div>

      {/* 지원서 목록 테이블 */}
      <Card className="border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-200 py-4">
          <CardTitle className="text-base text-slate-900">전체 지원서 {rows.length}건</CardTitle>
        </CardHeader>
        <CardContent className="py-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>전화번호</TableHead>
                <TableHead>대학교</TableHead>
                <TableHead>전공</TableHead>
                <TableHead>기수</TableHead>
                <TableHead>접수일</TableHead>
                <TableHead>상세</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                // 지원서가 없을 때 표시
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-slate-500">
                    아직 접수된 지원서가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                // 지원서 목록 표시
                rows.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell className="font-medium text-slate-900">{app.applicantName}</TableCell>
                    <TableCell className="text-slate-600">{app.applicantEmail}</TableCell>
                    <TableCell className="text-slate-600">{app.applicantPhone || "-"}</TableCell>
                    <TableCell className="text-slate-600">{app.university || "-"}</TableCell>
                    <TableCell className="text-slate-600">{app.major || "-"}</TableCell>
                    {/* 기수 배지 */}
                    <TableCell>
                      <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                        {app.cohortName}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-600">{formatDate(app.submittedAt)}</TableCell>
                    {/* 상세 보기 버튼 — 모달 대화상자로 전체 내용 표시 */}
                    <TableCell>
                      <Dialog>
                        <DialogTrigger render={<Button variant="outline" size="sm" />}>
                          보기
                        </DialogTrigger>
                        {/* 지원서 상세 내용 모달 */}
                        <DialogContent className="sm:max-w-lg">
                          <DialogHeader>
                            <DialogTitle>{app.applicantName}님의 지원서</DialogTitle>
                            <DialogDescription>
                              {app.cohortName} | {formatDate(app.submittedAt)}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 text-sm">
                            {/* 연락처 정보 */}
                            <div>
                              <p className="font-medium text-slate-900">연락처</p>
                              <p className="text-slate-600">{app.applicantEmail}</p>
                              {app.applicantPhone && (
                                <p className="text-slate-600">{app.applicantPhone}</p>
                              )}
                            </div>
                            
                            {/* 학교 / 전공 정보 (있으면 표시) */}
                            {(app.university || app.major) && (
                              <div>
                                <p className="font-medium text-slate-900">학교 / 전공</p>
                                <p className="text-slate-600">
                                  {[app.university, app.major].filter(Boolean).join(" / ")}
                                </p>
                              </div>
                            )}
                            
                            {/* 지원 동기 */}
                            <div>
                              <p className="font-medium text-slate-900">지원 동기</p>
                              {/* whitespace-pre-wrap — 입력한 그대로의 줄바꿈 표시 */}
                              <p className="whitespace-pre-wrap text-slate-600">{app.motivation}</p>
                            </div>
                            
                            {/* 추가 정보 (있으면 표시) */}
                            {app.additionalInfo && (
                              <div>
                                <p className="font-medium text-slate-900">추가 정보</p>
                                <p className="whitespace-pre-wrap text-slate-600">
                                  {app.additionalInfo}
                                </p>
                              </div>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}
