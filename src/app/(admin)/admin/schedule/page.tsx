/**
 * 일정 관리 목록 페이지
 *
 * 역할: 등록된 모든 일정을 날짜 역순으로 표시하고 수정/삭제 링크 제공
 * 사용 위치: /admin/schedule
 */

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteScheduleEvent, getAllScheduleEvents } from "@/features/schedule/actions";
import { requireAdmin } from "@/lib/admin";

export const metadata = { title: "일정 관리" };

export const dynamic = "force-dynamic";

// 이벤트 유형 한국어 레이블
const eventTypeLabels = {
  CLASS: "정기수업",
  EVENT: "행사",
} as const;

// 세션 카테고리 한국어 레이블
const categoryLabels = {
  CLASSICS: "고전 읽기",
  ENGLISH: "영어",
  SPEECH: "스피치 특강",
  SPECIAL_LECTURE: "특강",
  CASE_STUDY: "케이스스터디",
} as const;

export default async function AdminSchedulePage() {
  await requireAdmin();

  const events = await getAllScheduleEvents();

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a]">일정 관리</h1>
        <Link
          href="/admin/schedule/new"
          className={buttonVariants({ className: "bg-[#1a1a1a] text-white hover:bg-[#333333]" })}
        >
          새 일정 등록
        </Link>
      </div>

      <Card className="border-[#D9D9D9] bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-[#D9D9D9] py-4">
          <CardTitle className="text-base text-[#1a1a1a]">전체 일정 {events.length}개</CardTitle>
        </CardHeader>
        <CardContent className="py-0">
          {events.length === 0 ? (
            <div className="py-12 text-center text-[#666666]">등록된 일정이 없습니다.</div>
          ) : (
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>제목</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>세션</TableHead>
                    <TableHead>기수</TableHead>
                    <TableHead>공개</TableHead>
                    <TableHead className="text-right">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => {
                    // 현재 날짜 기준으로 지난 일정은 흐리게 표시
                    const isPast = event.eventDate < new Date();

                    return (
                      <TableRow
                        key={event.id}
                        className={isPast ? "opacity-50" : undefined}
                      >
                        {/* 날짜 */}
                        <TableCell className="whitespace-nowrap font-medium text-[#1a1a1a]">
                          {event.eventDate.toLocaleDateString("ko-KR", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            weekday: "short",
                          })}
                        </TableCell>

                        {/* 제목 */}
                        <TableCell className="text-[#1a1a1a]">{event.title}</TableCell>

                        {/* 유형 뱃지 */}
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              event.eventType === "CLASS"
                                ? "border-blue-200 bg-blue-50 text-blue-700"
                                : "border-green-200 bg-green-50 text-green-700"
                            }
                          >
                            {eventTypeLabels[event.eventType]}
                          </Badge>
                        </TableCell>

                        {/* 세션 목록 (CLASS일 때만) */}
                        <TableCell className="text-sm text-[#666666]">
                          {event.sessions.length > 0
                            ? event.sessions
                                .map((s) => categoryLabels[s.category])
                                .join(" · ")
                            : "-"}
                        </TableCell>

                        {/* 기수 */}
                        <TableCell className="text-[#666666]">
                          {event.cohort?.name ?? "-"}
                        </TableCell>

                        {/* 공개 여부 */}
                        <TableCell>
                          <span
                            className={
                              event.isPublic
                                ? "text-green-600 font-medium"
                                : "text-[#666666]"
                            }
                          >
                            {event.isPublic ? "공개" : "비공개"}
                          </span>
                        </TableCell>

                        {/* 수정/삭제 */}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/admin/schedule/${event.id}`}
                              className={buttonVariants({ variant: "outline" })}
                            >
                              수정
                            </Link>
                            <form
                              action={async () => {
                                "use server";
                                await deleteScheduleEvent(event.id);
                              }}
                            >
                              <Button type="submit" variant="destructive">
                                삭제
                              </Button>
                            </form>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
