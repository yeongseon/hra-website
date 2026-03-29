import { desc, isNotNull } from "drizzle-orm";
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
import { cohorts } from "@/lib/db/schema";
import { fetchSheetData } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";

export default async function AdminApplicationsPage() {
  await requireAdmin();

  try {
    const cohortsWithSheets = await db
      .select({
        id: cohorts.id,
        name: cohorts.name,
        googleSheetId: cohorts.googleSheetId,
      })
      .from(cohorts)
      .where(isNotNull(cohorts.googleSheetId))
      .orderBy(desc(cohorts.createdAt));

    const cohortsWithValidSheets = cohortsWithSheets.filter(
      (cohort): cohort is typeof cohort & { googleSheetId: string } => cohort.googleSheetId !== null,
    );

    const cohortsWithResponses = await Promise.all(
      cohortsWithValidSheets.map(async (cohort) => {
        const sheet = await fetchSheetData(cohort.googleSheetId);

        return {
          ...cohort,
          sheet,
        };
      }),
    );

    return (
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-10">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">지원서 관리</h1>
          <p className="mt-1 text-sm text-slate-500">기수별 구글 시트 응답 데이터를 확인할 수 있습니다.</p>
        </div>

        {cohortsWithResponses.length === 0 ? (
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="py-8 text-center text-sm text-slate-600">
              구글 시트가 연동된 기수가 없습니다. 기수 관리에서 구글 시트 ID를 설정해주세요.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {cohortsWithResponses.map((cohort) => {
              const headers = cohort.sheet.headers;
              const hasHeaders = headers.length > 0;

              return (
                <Card key={cohort.id} className="border-slate-200 bg-white py-0 shadow-sm">
                  <CardHeader className="border-b border-slate-200 py-4">
                    <CardTitle className="text-base text-slate-900">{cohort.name} 지원서</CardTitle>
                  </CardHeader>
                  <CardContent className="py-4">
                    {cohort.sheet.error ? (
                      <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
                        시트 데이터를 불러오지 못했습니다. {cohort.sheet.error}
                      </div>
                    ) : !hasHeaders || cohort.sheet.rows.length === 0 ? (
                      <p className="py-2 text-sm text-slate-600">시트에 응답 데이터가 없습니다.</p>
                    ) : (
                      <div className="overflow-x-auto -mx-4 sm:mx-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {headers.map((header) => (
                                <TableHead key={header} className="text-slate-700">
                                  {header}
                                </TableHead>
                              ))}
                              <TableHead className="text-slate-700">상태</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {cohort.sheet.rows.map((row, index) => (
                              <TableRow key={`${cohort.id}-${index}`}>
                                {headers.map((header) => (
                                  <TableCell key={`${cohort.id}-${index}-${header}`} className="text-slate-600">
                                    {row[header] || "-"}
                                  </TableCell>
                                ))}
                                <TableCell className="text-slate-600">상태 연동 예정</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    );
  } catch (error) {
    console.error("[admin/applications] DB 조회 오류:", error);

    return (
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-10">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">지원서 관리</h1>
          <p className="mt-1 text-sm text-slate-500">기수별 구글 시트 응답 데이터를 확인할 수 있습니다.</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-800">데이터를 불러오지 못했습니다.</p>
          <p className="mt-1 text-xs text-red-600">데이터베이스 연결을 확인해 주세요.</p>
        </div>
      </section>
    );
  }
}
