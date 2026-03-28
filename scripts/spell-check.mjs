#!/usr/bin/env node

/**
 * 한국어 맞춤법/띄어쓰기 검사 스크립트
 *
 * 사용법:
 *   node scripts/spell-check.mjs              # 검사만 (리포트 출력)
 *   node scripts/spell-check.mjs --fix        # 검사 + 자동 교정 적용
 *   node scripts/spell-check.mjs --files src/app/(public)/page.tsx  # 특정 파일만
 *
 * hanspell 라이브러리(다음 맞춤법 API)를 사용합니다.
 * 네트워크 연결이 필요합니다.
 */

import { createRequire } from "module";
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { resolve, relative } from "path";

const require = createRequire(import.meta.url);
const hanspell = require("hanspell");

// ── CLI 인자 파싱 ──────────────────────────────────────────────
const args = process.argv.slice(2);
const fixMode = args.includes("--fix");
const filesArgIdx = args.indexOf("--files");
const verbose = args.includes("--verbose");

// ── 대상 파일 결정 ──────────────────────────────────────────────
const ROOT = resolve(import.meta.dirname, "..");

/**
 * 대상 .tsx 파일 목록을 가져옵니다.
 * --files 인자가 있으면 해당 파일만, 없으면 src/ 하위 모든 .tsx
 */
async function getTargetFiles() {
  if (filesArgIdx !== -1 && args[filesArgIdx + 1]) {
    return args
      .slice(filesArgIdx + 1)
      .filter((a) => !a.startsWith("--"))
      .map((f) => resolve(ROOT, f));
  }

  // 재귀적으로 src/ 하위의 .tsx 파일 탐색
  const results = [];
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(".tsx")) results.push(full);
    }
  }
  walk(resolve(ROOT, "src"));
  return results;
}

// ── 한국어 텍스트 추출 ──────────────────────────────────────────
/**
 * TSX 소스에서 한국어가 포함된 문자열 리터럴과 JSX 텍스트 노드를 추출합니다.
 * 반환: [{ text, line, col, startIndex, endIndex }]
 */
function extractKoreanTexts(source) {
  const results = [];
  const koreanRe = /[\uAC00-\uD7AF]/;

  // 1. JSX 텍스트 노드: > ... < 사이의 텍스트 (태그 사이 텍스트)
  //    간단한 정규식 기반 추출
  const jxsTextRe = />([^<>{}`]+)</g;
  let m = jxsTextRe.exec(source);
  while (m !== null) {
    const text = m[1].trim();
    if (text && koreanRe.test(text)) {
      results.push({
        text,
        original: m[1],
        startIndex: m.index + 1,
        endIndex: m.index + 1 + m[1].length,
        type: "jsx-text",
      });
    }
    m = jxsTextRe.exec(source);
  }

  // 2. 문자열 리터럴: "..." 또는 '...' 안의 한국어
  const strRe = /(?<!=)(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)')/g;
  m = strRe.exec(source);
  while (m !== null) {
    const text = m[1] || m[2];
    if (text && koreanRe.test(text)) {
      results.push({
        text,
        original: text,
        startIndex: m.index + 1, // skip opening quote
        endIndex: m.index + 1 + text.length,
        type: "string-literal",
      });
    }
    m = strRe.exec(source);
  }

  // 3. 템플릿 리터럴 내 한국어 (정적 부분만)
  const tplRe = /`([^`]*)`/g;
  m = tplRe.exec(source);
  while (m !== null) {
    const text = m[1];
    if (text && koreanRe.test(text)) {
      // ${} 내부 제외하고 한국어 텍스트 부분만
      const staticParts = text.split(/\$\{[^}]*\}/);
      for (const part of staticParts) {
        if (part.trim() && koreanRe.test(part)) {
          results.push({
            text: part.trim(),
            original: part,
            startIndex: m.index + 1 + text.indexOf(part),
            endIndex: m.index + 1 + text.indexOf(part) + part.length,
            type: "template-literal",
          });
        }
      }
    }
    m = tplRe.exec(source);
  }

  return results;
}

// ── 유틸리티 ──────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── hanspell 래퍼 ──────────────────────────────────────────────
/**
 * hanspell로 텍스트를 검사합니다.
 * Rate-limit 에러 시 최대 maxRetries회까지 재시도합니다.
 * @returns Promise<{token, suggestions, type?, context?}[]>
 */
const RETRY_DELAY_MS = 2000;
const MAX_RETRIES = 3;

function checkSpelling(text, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const results = [];
    hanspell.spellCheckByDAUM(
      text,
      timeout,
      (corrections) => {
        results.push(...corrections);
      },
      () => resolve(results),
      (err) => reject(new Error(String(err)))
    );
  });
}

async function checkSpellingWithRetry(text, timeout = 10000) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await checkSpelling(text, timeout);
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * (attempt + 1);
        if (verbose) {
          console.error(`      ↻ 재시도 ${attempt + 1}/${MAX_RETRIES} (${delay}ms 후)...`);
        }
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
}

// ── 메인 ──────────────────────────────────────────────────────
async function main() {
  const files = await getTargetFiles();
  console.log(
    `\n🔍 한국어 맞춤법 검사${fixMode ? " + 자동 교정" : ""} 시작\n`
  );
  console.log(`   대상 파일: ${files.length}개\n`);

  let totalIssues = 0;
  let totalFiles = 0;
  const allResults = [];

  for (const file of files) {
    const relPath = relative(ROOT, file);
    const source = readFileSync(file, "utf-8");
    const koreanTexts = extractKoreanTexts(source);

    if (koreanTexts.length === 0) continue;

    // 모든 한국어 텍스트를 하나로 합쳐서 검사 (API 호출 최소화)
    const combined = koreanTexts.map((t) => t.text).join("\n");

    let corrections;
    try {
      corrections = await checkSpellingWithRetry(combined);
    } catch (err) {
      console.error(`   ⚠️  ${relPath}: API 호출 실패 - ${err.message}`);
      continue;
    }

    // API rate-limit 방지: 파일 간 딜레이
    await sleep(1000);

    if (corrections.length === 0) {
      if (verbose) {
        console.log(`   ✅ ${relPath} — 문제 없음`);
      }
      continue;
    }

    totalFiles++;
    totalIssues += corrections.length;

    console.log(`   📄 ${relPath}`);
    for (const c of corrections) {
      const suggestion = c.suggestions?.[0] || "(제안 없음)";
      const typeLabel = c.type === "space" ? "띄어쓰기" : "맞춤법";
      console.log(
        `      ${typeLabel}: "${c.token}" → "${suggestion}"${c.context ? ` (문맥: ${c.context})` : ""}`
      );
    }
    console.log();

    allResults.push({ file, relPath, source, corrections });
  }

  // ── 자동 교정 모드 ──────────────────────────────────────────
  if (fixMode && allResults.length > 0) {
    console.log(`\n🔧 자동 교정 적용 중...\n`);
    let fixedFiles = 0;

    for (const { file, relPath, source, corrections } of allResults) {
      let modified = source;
      let applied = 0;

      for (const c of corrections) {
        if (!c.suggestions || c.suggestions.length === 0) continue;
        const suggestion = c.suggestions[0];

        // 소스에서 해당 토큰을 교정어로 치환
        // 단어 경계를 고려하여 치환 (같은 토큰이 여러 곳에 있을 수 있으므로 모두 치환)
        const escaped = c.token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(escaped, "g");
        const before = modified;
        modified = modified.replace(re, suggestion);
        if (modified !== before) applied++;
      }

      if (applied > 0) {
        writeFileSync(file, modified, "utf-8");
        console.log(`   ✅ ${relPath} — ${applied}건 교정 적용`);
        fixedFiles++;
      }
    }

    console.log(`\n   교정 완료: ${fixedFiles}개 파일\n`);
  }

  // ── 결과 요약 ──────────────────────────────────────────────
  console.log("─".repeat(50));
  if (totalIssues === 0) {
    console.log("✅ 맞춤법/띄어쓰기 문제가 발견되지 않았습니다.\n");
    process.exit(0);
  } else {
    console.log(
      `⚠️  총 ${totalFiles}개 파일에서 ${totalIssues}건의 문제가 발견되었습니다.`
    );
    if (!fixMode) {
      console.log(
        `   자동 교정을 적용하려면: node scripts/spell-check.mjs --fix\n`
      );
    }
    console.log();
    process.exit(fixMode ? 0 : 1);
  }
}

main().catch((err) => {
  console.error("❌ 스크립트 실행 오류:", err);
  process.exit(1);
});
