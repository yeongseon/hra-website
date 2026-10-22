/** 저장소 secret 검사 정책. 정확히 검증한 합성 Blob fixture만 값 해시·파일·규칙으로 제외한다. */
import { createHash } from 'node:crypto';
export const gitleaksVersion = '8.30.1';
export const gitleaksBinarySha256 = '88f91962aa2f93ac6ab281d553b9e125f5197bbbce38f9f2437f7299c32e5509';
/** 과거 세 도입 커밋의 같은 fixture. vi.stubEnv와 @vercel/blob mock 안의 명시적 fixture 표식이며 실제 발급 토큰이 아니다. */
export function isVerifiedSyntheticFinding(finding) {
  return finding.RuleID === 'generic-api-key'
    && finding.File.replaceAll('\\', '/') === 'tests/unit/academic-upload-server.test.ts'
    && createHash('sha256').update(finding.Secret).digest('hex') === '8a47a435c37ed3440f338819c398dba720bd993976d0d0588d25a2f487a70092';
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
