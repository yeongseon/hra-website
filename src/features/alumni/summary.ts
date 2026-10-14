/**
 * 수료생 이야기 목록·사이드바에 사용할 짧은 평문을 DB에서 생성합니다 (#127).
 * 전체 본문을 브라우저로 전달하지 않도록 SELECT 투영에 사용합니다.
 */
import { sql } from "drizzle-orm";
import { alumniStories } from "@/lib/db/schema";

// HTML 태그와 Markdown 링크 URL을 제거하되 링크의 표시 문구는 남깁니다.
const withoutHtml = sql`regexp_replace(${alumniStories.content}, ${"<[^>]*>"}, ' ', 'g')`;
const withoutLinkUrls = sql`regexp_replace(${withoutHtml}, ${"!?\\[([^\\]]+)\\]\\([^)]+\\)"}, ${"\\1"}, 'g')`;
const withoutMarkdown = sql`regexp_replace(${withoutLinkUrls}, ${"[`#>*_~!\\[\\]()]"}, ' ', 'g')`;

// 공백을 정리한 뒤 최대 180자만 DB에서 반환합니다.
export const alumniStorySummary = sql<string>`left(trim(regexp_replace(${withoutMarkdown}, ${"\\s+"}, ' ', 'g')), 180)`;
