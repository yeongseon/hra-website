/** 공개 문서·테스트의 대표 개인정보 표식을 검사하며 예외는 파일·규칙·값 해시로 제한합니다. */
import { createHash } from 'node:crypto';
export const publicSourceRules = Object.freeze(['SOURCE_EMAIL', 'SOURCE_KR_MOBILE', 'SOURCE_RESIDENT_ID', 'SOURCE_SESSION_COOKIE', 'SOURCE_JWT']);
/** IANA 예약 예시 도메인과 프로젝트의 정확한 기술 namespace만 허용합니다. */
function reservedEmail(value) {
  const domain = value.slice(value.lastIndexOf('@') + 1).toLowerCase();
  return /(?:^|\.)(?:invalid|test|example|localhost)$/.test(domain)
    || /(?:^|\.)example\.(?:com|net|org)$/.test(domain)
    || domain === 'users.noreply.github.com' || domain === 'noreply.github.com'
    || domain === 'oauth.placeholder';
}
export const sourceValueHash = value => createHash('sha256').update(value).digest('hex');
/** 원문 값은 내부 판정에만 사용하고 CLI 결과로 반환하지 않습니다. */
export function findPublicSourceRisks(text) {
  if (typeof text !== 'string') throw new Error('PUBLIC_SOURCE_INVALID');
  const rules = [
    ['SOURCE_EMAIL', /(?<![A-Z0-9._%+-])[A-Z0-9._%+-]{1,64}@[A-Z0-9](?:[A-Z0-9.-]{0,251}[A-Z0-9])?\.[A-Z]{2,63}/gi],
    ['SOURCE_KR_MOBILE', /(?<![A-Za-z0-9])(?:\+82[ .\t-]?(?:\(0\))?[ .\t-]?0?1[016789]|01[016789])[ .\t-]?\d{3,4}[ .\t-]?\d{4}(?![A-Za-z0-9])/g],
    ['SOURCE_RESIDENT_ID', /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[ -]?[1-8]\d{6}(?!\d)/g],
    ['SOURCE_SESSION_COOKIE', /(?:__Secure-)?(?:next-auth|authjs)\.session-token(?:\.\d+)?[ \t]*=[ \t]*[^;\s"'`]+/g],
    ['SOURCE_JWT', /\beyJ[A-Za-z0-9_-]{3,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g],
  ];
  return rules.flatMap(([rule, pattern]) => [...text.matchAll(pattern)].filter(match => rule !== 'SOURCE_EMAIL' || !reservedEmail(match[0])).map(match => ({ rule, value: match[0] })));
}
/** 예외 목록도 닫힌 스키마이며 디렉터리·정규식 단위 예외를 허용하지 않습니다. */
export function validateSourceFixtures(ledger) {
  if (!Array.isArray(ledger) || ledger.length > 300) throw new Error('PUBLIC_SOURCE_FIXTURES_INVALID');
  const seen = new Set();
  for (const item of ledger) {
    if (!item || Object.keys(item).sort().join() !== 'file,reason,rule,sha256' || typeof item.file !== 'string'
      || item.file !== '.env.example' && !/^(?:docs|tests|content)\/[A-Za-z0-9_./@()[\]-]+$/.test(item.file) || item.file.split('/').some(part => !part || part === '..' || part === '.')
      || !publicSourceRules.includes(item.rule) || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)
      || typeof item.reason !== 'string' || item.reason.length < 10 || item.reason.length > 300) throw new Error('PUBLIC_SOURCE_FIXTURES_INVALID');
    const key = `${item.file}:${item.rule}:${item.sha256}`;
    if (seen.has(key)) throw new Error('PUBLIC_SOURCE_FIXTURES_INVALID'); seen.add(key);
  }
  return ledger;
}
/** 검토된 정확한 합성 값만 제외하고 나머지는 규칙별 개수로 집계합니다. */
export function summarizePublicSource(files, ledger) {
  validateSourceFixtures(ledger);
  const counts = Object.fromEntries(publicSourceRules.map(rule => [rule, 0])); let syntheticFixtures = 0;
  for (const { file, text } of files) {
    for (const finding of findPublicSourceRisks(text)) {
      if (ledger.some(item => item.file === file && item.rule === finding.rule && item.sha256 === sourceValueHash(finding.value))) syntheticFixtures++;
      else counts[finding.rule]++;
    }
  }
  return { rules: counts, findings: Object.values(counts).reduce((sum, count) => sum + count, 0), syntheticFixtures };
}
