/** npm advisory의 정확한 집합과 lock 경로를 검토 원장과 대조한다. npm severity를 HRA P1로 자동 변환하지 않는다. */
const severities = new Set(['low', 'moderate', 'high', 'critical']);
const canonical = value => JSON.stringify(value);
// 달력에 존재하지 않는 날짜를 기한으로 사용해 만료 검사를 우회하지 못하게 한다.
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
/** nodes와 advisory는 독립 집합이다. 둘을 곱해 확인되지 않은 설치 경로를 만들지 않는다. */
export function dependencySnapshot(audit, lock) {
  if (!audit || audit.auditReportVersion !== 2 || audit.error || !audit.vulnerabilities || typeof audit.vulnerabilities !== 'object' || Array.isArray(audit.vulnerabilities) || !lock?.packages) throw new Error('DEPENDENCY_REPORT_INVALID');
  return Object.entries(audit.vulnerabilities).sort(([a], [b]) => a.localeCompare(b)).map(([name, item]) => {
    if (item.name !== name || !severities.has(item.severity) || typeof item.range !== 'string' || !Array.isArray(item.nodes) || !item.nodes.length || !Array.isArray(item.via) || !item.via.length) throw new Error('DEPENDENCY_REPORT_INVALID');
    const nodes = item.nodes.map(path => {
      if (typeof path !== 'string' || !path.startsWith('node_modules/') || !lock.packages[path]?.version) throw new Error('DEPENDENCY_LOCK_MISMATCH');
      return { path, version: lock.packages[path].version, development: lock.packages[path].dev === true };
    }).sort((a, b) => a.path.localeCompare(b.path));
    const via = item.via.map(advisory => {
      if (typeof advisory === 'string' && advisory) return { dependency: advisory };
      if (!advisory || !Number.isSafeInteger(advisory.source) || !/^https:\/\/github\.com\/advisories\/GHSA-[a-z0-9-]+$/.test(advisory.url) || !severities.has(advisory.severity) || typeof advisory.range !== 'string' || typeof advisory.title !== 'string') throw new Error('DEPENDENCY_REPORT_INVALID');
      return { source: advisory.source, id: advisory.url.split('/').at(-1), severity: advisory.severity, range: advisory.range, title: advisory.title };
    }).sort((a, b) => canonical(a).localeCompare(canonical(b)));
    return { name, severity: item.severity, range: item.range, nodes, via };
  });
}
/** 변경/누락/만료/미분류/P1은 차단한다. 원장의 owner는 유지보수 담당이며 위험 수용 승인으로 해석하지 않는다. */
export function verifyDependencyPolicy(audit, lock, policy, today = new Date().toISOString().slice(0, 10)) {
  const snapshot = dependencySnapshot(audit, lock);
  if (!policy || policy.schemaVersion !== 1 || !Array.isArray(policy.packages) || !Array.isArray(policy.assessments)
    || canonical(snapshot) !== canonical(policy.packages)) throw new Error('DEPENDENCY_TRIAGE_CHANGED');
  const required = snapshot.flatMap(pkg => pkg.via.map(via => `${pkg.name}:${via.source ?? via.dependency}`));
  if (policy.assessments.length !== required.length || new Set(policy.assessments.map(item => item.key)).size !== required.length) throw new Error('DEPENDENCY_TRIAGE_MISSING');
  for (const key of required) {
    const item = policy.assessments.find(entry => entry.key === key);
    if (!item || item.priority !== 'P2' || item.owner !== 'repo-maintainers'
      || !validDate(item.reviewedOn) || !validDate(item.reviewBy) || !validDate(today)
      || item.reviewedOn > today || item.reviewBy < today || item.reviewedOn > item.reviewBy
      || ['attackCondition', 'usedApi', 'callLocations', 'assessment', 'residualAssumptions'].some(field => typeof item[field] !== 'string' || item[field].trim().length < 15)) throw new Error('DEPENDENCY_TRIAGE_INVALID');
  }
  return { affectedPackages: snapshot.length, advisoryEntries: snapshot.reduce((sum, item) => sum + item.via.filter(via => via.source).length, 0), p1: 0 };
}
