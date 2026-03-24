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

export const dynamic = "force-dynamic";

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);

export default async function AdminApplicationsPage() {
  await requireAdmin();

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
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">지원서 관리</h1>
        <p className="mt-1 text-sm text-slate-500">접수된 지원서를 확인할 수 있습니다. (읽기 전용)</p>
      </div>

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
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-slate-500">
                    아직 접수된 지원서가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell className="font-medium text-slate-900">{app.applicantName}</TableCell>
                    <TableCell className="text-slate-600">{app.applicantEmail}</TableCell>
                    <TableCell className="text-slate-600">{app.applicantPhone || "-"}</TableCell>
                    <TableCell className="text-slate-600">{app.university || "-"}</TableCell>
                    <TableCell className="text-slate-600">{app.major || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                        {app.cohortName}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-600">{formatDate(app.submittedAt)}</TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger render={<Button variant="outline" size="sm" />}>
                          보기
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-lg">
                          <DialogHeader>
                            <DialogTitle>{app.applicantName}님의 지원서</DialogTitle>
                            <DialogDescription>
                              {app.cohortName} | {formatDate(app.submittedAt)}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 text-sm">
                            <div>
                              <p className="font-medium text-slate-900">연락처</p>
                              <p className="text-slate-600">{app.applicantEmail}</p>
                              {app.applicantPhone && (
                                <p className="text-slate-600">{app.applicantPhone}</p>
                              )}
                            </div>
                            {(app.university || app.major) && (
                              <div>
                                <p className="font-medium text-slate-900">학교 / 전공</p>
                                <p className="text-slate-600">
                                  {[app.university, app.major].filter(Boolean).join(" / ")}
                                </p>
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-slate-900">지원 동기</p>
                              <p className="whitespace-pre-wrap text-slate-600">{app.motivation}</p>
                            </div>
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
