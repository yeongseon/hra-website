/**
 * HTML → Markdown 일괄 마이그레이션 스크립트
 *
 * 배경:
 *   기존 RichTextEditor 가 TipTap HTML 을 그대로 DB 에 저장하고 있었기 때문에,
 *   에디터를 진짜 마크다운 입출력으로 전환하는 것과 함께 기존 HTML 데이터를 마크다운으로 변환합니다.
 *
 * 대상 컬럼 (총 5개, AGENTS.md §4 기준):
 *   - notices.content
 *   - class_logs.content
 *   - weekly_texts.body
 *   - report_templates.body
 *   - recruitment_settings.details_markdown  (이름은 markdown 이지만 실제로는 HTML 이 들어있음)
 *
 * 사용법:
 *   node scripts/migrate-html-to-markdown.mjs --dry-run   # 변환 결과 미리보기 (DB 변경 없음)
 *   node scripts/migrate-html-to-markdown.mjs             # 실제 DB 업데이트 수행
 *
 * 안전장치:
 *   - 이미 마크다운으로 보이는 콘텐츠 (HTML 태그 미감지) 는 건드리지 않음
 *   - 빈 문자열/NULL 도 스킵
 *   - 변환 전후를 콘솔에 로깅
 *   - --dry-run 기본 권장
 */

import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL 환경변수가 설정되어 있지 않습니다.");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");

// Turndown 설정: ATX 헤딩(#), fenced 코드블록(```), 리스트는 - 사용
const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
  strongDelimiter: "**",
  hr: "---",
});

// GFM 플러그인 (테이블, 취소선, 작업목록 지원)
try {
  turndown.use(gfm);
} catch {
  // turndown-plugin-gfm 미설치 시 graceful degrade
  console.warn("⚠️ turndown-plugin-gfm 미설치 → GFM(테이블/취소선) 변환 생략");
}

// 비표준 마크다운 요소 제거: style/color/highlight/정렬은 마크다운에 매핑 불가
turndown.remove(["style", "script"]);

// span 의 inline style (color/background-color) 은 무시하고 텍스트만 남김
turndown.addRule("stripInlineStyle", {
  filter: (node) => node.nodeName === "SPAN" && node.getAttribute("style"),
  replacement: (content) => content,
});

// 마이그레이션 대상 컬럼 정의 (raw SQL 방식 - schema 의존도 최소화)
const TARGETS = [
  { table: "notices", column: "content" },
  { table: "class_logs", column: "content" },
  { table: "weekly_texts", column: "body" },
  { table: "report_templates", column: "body" },
  { table: "recruitment_settings", column: "details_markdown" },
];

// HTML 여부 판단 휴리스틱
// - 알려진 HTML 태그명만 매칭 (마크다운 autolink `<https://...>`, `<user@...>` 보호)
// - 닫는 태그(</p>) 또는 self-closing(<br/>) 도 함께 인식
const HTML_TAG_NAMES = [
  "a", "abbr", "address", "article", "aside", "b", "blockquote", "br",
  "code", "dd", "del", "details", "div", "dl", "dt", "em", "figcaption",
  "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr",
  "i", "iframe", "img", "ins", "kbd", "li", "mark", "nav", "ol", "p", "pre",
  "q", "s", "samp", "section", "small", "span", "strong", "sub", "summary",
  "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
  "video", "audio", "source",
];
const HTML_TAG_REGEX = new RegExp(
  `<\\/?(?:${HTML_TAG_NAMES.join("|")})(?:\\s[^>]*)?\\/?>`,
  "i",
);

function looksLikeHtml(value) {
  if (!value) return false;
  return HTML_TAG_REGEX.test(value);
}

const sql = neon(DATABASE_URL);

async function migrateOne({ table, column }) {
  console.log(`\n━━━ ${table}.${column} ━━━`);

  // raw SQL로 id, value 조회 (테이블/컬럼명은 화이트리스트라 인터폴레이션 안전)
  const rows = await sql.query(`SELECT id, ${column} AS value FROM ${table}`);

  let converted = 0;
  let skippedNotHtml = 0;
  let skippedEmpty = 0;

  for (const row of rows) {
    const original = row.value;

    if (original === null || original === undefined || String(original).trim() === "") {
      skippedEmpty += 1;
      continue;
    }

    if (!looksLikeHtml(original)) {
      skippedNotHtml += 1;
      console.log(`  · [${row.id}] HTML 미감지 → 스킵`);
      continue;
    }

    const markdown = turndown.turndown(original).trim();

    console.log(`  · [${row.id}] ${original.length} chars HTML → ${markdown.length} chars MD`);
    if (DRY_RUN) {
      console.log("    --- preview (앞 200자) ---");
      console.log("    " + markdown.slice(0, 200).replace(/\n/g, "\n    "));
    } else {
      await sql.query(`UPDATE ${table} SET ${column} = $1 WHERE id = $2`, [markdown, row.id]);
    }
    converted += 1;
  }

  console.log(
    `  → 변환 ${converted}건, HTML아님 스킵 ${skippedNotHtml}건, 빈값 스킵 ${skippedEmpty}건`,
  );
  return { converted, skippedNotHtml, skippedEmpty };
}

async function main() {
  console.log(`🚀 HTML → Markdown 마이그레이션 시작 (${DRY_RUN ? "DRY-RUN" : "WRITE"})`);

  const totals = { converted: 0, skippedNotHtml: 0, skippedEmpty: 0 };
  for (const target of TARGETS) {
    const result = await migrateOne(target);
    totals.converted += result.converted;
    totals.skippedNotHtml += result.skippedNotHtml;
    totals.skippedEmpty += result.skippedEmpty;
  }

  console.log(`\n🎉 완료: 총 변환 ${totals.converted}건`);
  console.log(`        HTML 미감지 스킵 ${totals.skippedNotHtml}건, 빈값 스킵 ${totals.skippedEmpty}건`);
  if (DRY_RUN) {
    console.log("\nℹ️  DRY-RUN 모드였습니다. 실제 적용하려면 --dry-run 없이 다시 실행하세요.");
  }
}

main().catch((err) => {
  console.error("❌ 마이그레이션 실패:", err);
  process.exit(1);
});
