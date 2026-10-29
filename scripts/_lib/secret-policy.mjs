/** 저장소 secret 검사 정책. 정확히 검증한 합성 Blob fixture만 값 해시·파일·규칙으로 제외한다. */
import { createHash } from 'node:crypto';
export const gitleaksVersion = '8.30.1';
export const gitleaksBinarySha256 = '88f91962aa2f93ac6ab281d553b9e125f5197bbbce38f9f2437f7299c32e5509';
/**
 * 기존 업로드 서버와 v1 SDK 서명 테스트에서 검증한 합성 토큰만 제외합니다.
 * 실제 발급 토큰이 아닌 명시적 fixture이며, Git 이력에도 남으므로 파일별 원본 해시를 고정합니다.
 * 한 파일의 합성 값을 다른 파일에 옮긴 경우까지 예외로 처리하지 않습니다.
 */
export function isVerifiedSyntheticFinding(finding) {
  if (finding.RuleID !== 'generic-api-key') return false;
  const file = finding.File.replaceAll('\\', '/');
  const hash = createHash('sha256').update(finding.Secret).digest('hex');
  return (file === 'tests/unit/academic-upload-server.test.ts'
    && hash === '8a47a435c37ed3440f338819c398dba720bd993976d0d0588d25a2f487a70092')
    || (file === 'tests/unit/api-v1-academic-uploads-route.test.ts'
      && hash === 'a2f92a274f53faf8bbb3f105d5442077c4436c418ea3d9c288a425a05e09c66f');
}
/** 잘못된/누락 보고서는 0건으로 해석하지 않는다. 원문은 반환하지 않는다. */
export function summarizeSecretReport(value) {
  if (!Array.isArray(value)) throw new Error('SECRET_REPORT_INVALID');
  let excluded = 0;
  for (const item of value) {
    if (!item || typeof item.RuleID !== 'string' || !/^[a-z0-9-]+$/.test(item.RuleID)
      || typeof item.File !== 'string' || typeof item.Secret !== 'string' || !item.Secret) throw new Error('SECRET_REPORT_INVALID');
    if (isVerifiedSyntheticFinding(item)) excluded++;
  }
  return { findings: value.length - excluded, syntheticFixtures: excluded };
}
