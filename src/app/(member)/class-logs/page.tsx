/**
 * 수업일지 목록 페이지 (회원 전용)
 * 서버 컴포넌트: 모든 수업일지를 데이터베이스에서 조회하여 카드 형태로 표시하는 페이지입니다
 * - 서버에서 데이터베이스 조회가 완료된 후에 페이지가 렌더링됩니다
 * - 날짜가 최신순으로 정렬되어 표시됩니다
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";
import { classLogs, users } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

// dynamic = "force-dynamic": 매번 페이지를 새로 생성하도록 설정
// 캐시를 하지 않아 항상 최신 데이터를 표시합니다
export const dynamic = "force-dynamic";

// Metadata: 페이지 제목, 설명 등의 메타 정보 설정
// 브라우저 탭에 "수업일지"라고 표시됨
export const metadata: Metadata = {
  title: "수업일지",
};

// formatDate 함수: Date 객체를 한국 날짜 형식으로 변환
// 예: "2025년 3월 24일" 형태로 표시
const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);

// getExcerpt 함수: 긴 내용을 미리보기 형태로 자르는 함수
// - HTML 태그를 제거함 (예: <p>, <div> 등)
// - 120글자까지만 표시하고 "..."을 붙임
const getExcerpt = (content: string) => {
  const text = content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
};

/**
 * ClassLogsPage: async 함수 (비동기 서버 컴포넌트)
 * 서버에서 실행되며, 데이터베이스 조회가 끝난 후 페이지가 렌더링됩니다
 */
export default async function ClassLogsPage() {
  // 서버에서 데이터베이스에 접근하여 수업일지 목록을 가져옴
  // db.select: 어떤 컬럼을 가져올지 지정
  // .from(classLogs): classLogs 테이블에서 조회
  // .innerJoin(users, ...): users 테이블과 연결하여 작성자 이름도 함께 가져옴
  // .orderBy: 최신 날짜순으로 정렬
  const logs = await db
    .select({
      id: classLogs.id,
      title: classLogs.title,
      content: classLogs.content,
      classDate: classLogs.classDate,
      authorName: users.name,
    })
    .from(classLogs)
    .innerJoin(users, eq(classLogs.authorId, users.id))
    .orderBy(desc(classLogs.classDate), desc(classLogs.createdAt));

  return (
    <section className="mx-auto max-w-7xl px-6 py-10 md:py-14">
      {/* 페이지 제목과 수업일지 개수 표시 */}
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight text-white">수업일지</h1>
        {/* Badge: 전체 수업일지 개수를 표시하는 배지 */}
        <Badge variant="outline" className="border-white/20 text-white/80">
          {logs.length}개
        </Badge>
      </div>

      {/* 수업일지가 0개이면 "없습니다" 메시지 표시, 아니면 카드 목록 표시 */}
      {logs.length === 0 ? (
        <Card className="border-white/10 bg-white/[0.03] text-white">
          <CardContent className="py-10 text-center text-base text-white/70">
            수업일지가 없습니다
          </CardContent>
        </Card>
      ) : (
        // 수업일지들을 3개씩 한 줄에 배치 (모바일에서는 1개, 태블릿에서는 2개)
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {/* map 함수: logs 배열의 각 항목마다 카드를 만듦 */}
          {logs.map((log) => (
            // Link: 이 카드를 클릭하면 상세 페이지로 이동
            <Link key={log.id} href={`/class-logs/${log.id}`}>
              {/* Card: 각 수업일지를 카드 형태로 표시 */}
              <Card className="h-full border-white/10 bg-white/[0.03] text-white transition hover:border-white/30 hover:bg-white/[0.06]">
                <CardHeader className="space-y-3">
                  {/* 수업 날짜와 작성자 정보를 작은 글씨로 표시 */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
                    {/* Badge: 수업 날짜를 배지 형태로 표시 */}
                    <Badge variant="secondary" className="bg-white/10 text-white">
                      {formatDate(log.classDate)}
                    </Badge>
                    {/* 수업일지를 작성한 사람의 이름 표시 */}
                    <span>{log.authorName}</span>
                  </div>
                  {/* CardTitle: 수업일지 제목 (최대 2줄) */}
                  <CardTitle className="line-clamp-2 text-lg">{log.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  {/* CardDescription: 수업일지 내용의 미리보기 (최대 3줄) */}
                  <CardDescription className="line-clamp-3 text-sm leading-6 text-white/70">
                    {getExcerpt(log.content)}
                  </CardDescription>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
