/**
 * 수업일지 상세 페이지 (회원 전용)
 * 서버 컴포넌트: 선택된 수업일지의 상세 내용과 첨부된 이미지를 표시하는 페이지입니다
 * - URL의 [id] 부분에 수업일지의 고유 번호가 들어옵니다
 * - 존재하지 않는 아이디면 404 페이지가 표시됩니다
 * - 서버에서 데이터베이스 조회 후 페이지가 렌더링됩니다
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { classLogImages, classLogs, users } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";

// dynamic = "force-dynamic": 매번 페이지를 새로 생성하도록 설정
// 캐시를 하지 않아 항상 최신 데이터를 표시합니다
export const dynamic = "force-dynamic";

// 페이지 props의 타입 정의
// params는 Promise<{id: string}>로 감싸짐 (Next.js 15 동적 라우트 방식)
type PageProps = {
  params: Promise<{ id: string }>;
};

// formatDate 함수: Date 객체를 한국 날짜 형식으로 변환
// 예: "2025년 3월 24일" 형태로 표시
const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);

/**
 * getClassLog 함수: 데이터베이스에서 특정 수업일지를 조회하는 함수
 * @param id - 수업일지의 고유 번호
 * @returns 수업일지 정보 또는 undefined (찾지 못한 경우)
 * 
 * 서버에서 실행되므로 데이터베이스에 직접 접근할 수 있습니다
 */
const getClassLog = async (id: string) => {
  // 데이터베이스에서 조건에 맞는 수업일지 1개를 가져옴
  // db.select: 필요한 컬럼들을 지정
  // .from(classLogs): classLogs 테이블에서 조회
  // .innerJoin(users, ...): users 테이블과 연결하여 작성자 이름도 가져옴
  // .where(eq(classLogs.id, id)): id가 일치하는 항목만 필터링
  // .limit(1): 최대 1개만 가져옴
  const [log] = await db
    .select({
      id: classLogs.id,
      title: classLogs.title,
      content: classLogs.content,
      classDate: classLogs.classDate,
      authorName: users.name,
    })
    .from(classLogs)
    .innerJoin(users, eq(classLogs.authorId, users.id))
    .where(eq(classLogs.id, id))
    .limit(1);

  return log;
};

/**
 * generateMetadata 함수: 페이지의 제목과 설명을 동적으로 설정
 * 수업일지 제목을 브라우저 탭에 표시하려고 사용
 * @param params - URL 파라미터 (id)
 * @returns 메타데이터 객체
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  // URL에서 id를 추출
  const { id } = await params;
  // 수업일지 정보를 서버에서 조회
  const log = await getClassLog(id);

  // 만약 수업일지를 찾지 못했다면 기본 제목만 설정
  if (!log) {
    return {
      title: "수업일지",
    };
  }

  // 수업일지를 찾았으면 제목을 수업일지 제목으로 설정
  return {
    title: log.title,
  };
}

/**
 * ClassLogDetailPage: 수업일지 상세 페이지의 메인 컴포넌트
 * @param params - URL 파라미터 (id)
 */
export default async function ClassLogDetailPage({ params }: PageProps) {
  // URL에서 id를 추출
  const { id } = await params;
  // 수업일지 정보를 서버에서 조회
  const log = await getClassLog(id);

  // 만약 수업일지를 찾지 못했다면 404 페이지 표시
  if (!log) {
    notFound();
  }

  // 수업일지에 첨부된 이미지들을 데이터베이스에서 조회
  // 순서대로 정렬하여 가져옴
  const images = await db
    .select({
      id: classLogImages.id,
      url: classLogImages.url,
      alt: classLogImages.alt,
    })
    .from(classLogImages)
    .where(eq(classLogImages.classLogId, log.id))
    .orderBy(asc(classLogImages.order), asc(classLogImages.createdAt));

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-10 md:py-14">
      {/* "목록으로" 버튼 - 클릭하면 수업일지 목록 페이지로 이동 */}
      <div className="mb-6">
        <Link
          href="/class-logs"
          className="inline-flex items-center rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 transition hover:border-white/40 hover:text-white"
        >
          목록으로
        </Link>
      </div>

      {/* 수업일지 내용을 카드에 표시 */}
      <Card className="border-white/10 bg-white/[0.03] text-white">
        {/* 카드 상단: 수업 날짜, 작성자, 제목 */}
        <CardHeader className="space-y-4 border-b border-white/10">
          {/* 수업 날짜와 작성자 정보를 작은 글씨로 표시 */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
            {/* Badge: 수업 날짜를 배지 형태로 표시 */}
            <Badge variant="secondary" className="bg-white/10 text-white">
              {formatDate(log.classDate)}
            </Badge>
            {/* 수업일지를 작성한 사람의 이름 표시 */}
            <span>{log.authorName}</span>
          </div>
          {/* CardTitle: 수업일지 제목 */}
          <CardTitle className="text-2xl sm:text-3xl">{log.title}</CardTitle>
        </CardHeader>
        
        {/* 카드 내용: 수업일지 본문 */}
        <CardContent className="pt-6">
          {/* iframe: 수업일지 내용(HTML)을 안전하게 표시
              srcDoc: HTML 문자열을 직접 렌더링
              CSS를 포함하여 검은 배경에 흰색 글씨로 표시
          */}
          <iframe
            title="수업일지 내용"
            srcDoc={`<!doctype html><html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><style>body{margin:0;background:#000;color:#fff;font-family:var(--font-geist-sans),sans-serif;line-height:1.75}a{color:#fff}img{max-width:100%;height:auto;border-radius:12px}h1,h2,h3,h4,h5,h6{margin:0 0 12px;color:#fff}p{margin:0 0 14px;color:rgba(255,255,255,.85)}</style></head><body>${log.content}</body></html>`}
            className="h-[300px] sm:h-[420px] md:h-[520px] w-full rounded-xl border border-white/10 bg-black"
          />
        </CardContent>
      </Card>

      {/* 수업일지에 첨부된 이미지가 있으면 표시 */}
      {images.length > 0 && (
        // 이미지를 3개씩 한 줄에 배치 (모바일에서는 2개, 태블릿 이상에서는 3개)
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* map 함수: images 배열의 각 이미지마다 카드를 만듦 */}
          {images.map((image) => (
            <Card key={image.id} className="border-white/10 bg-white/[0.03] p-0">
              {/* 이미지 표시 */}
              <img
                src={image.url}
                alt={image.alt ?? log.title}
                className="h-64 w-full rounded-xl object-cover"
              />
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
