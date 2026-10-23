/** audit 네트워크/형식 실패와 새 advisory·설치 경로·만료·P1의 차단을 검증한다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dependencySnapshot, verifyDependencyPolicy } from '../_lib/dependency-policy.mjs';
const policy = JSON.parse(readFileSync(new URL('../../security/dependency-triage.json', import.meta.url)));
const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url)));
// 실제 원장의 독립 nodes/via 집합으로 npm 응답을 복원한다. 공격 조건 설명은 응답 metadata와 분리한다.
const audit = { auditReportVersion: 2, vulnerabilities: Object.fromEntries(policy.packages.map(pkg => [pkg.name, { name: pkg.name, severity: pkg.severity, range: pkg.range, nodes: pkg.nodes.map(node => node.path), via: pkg.via.map(v => v.source ? { ...v, url: 'https://github.com/advisories/' + v.id } : v.dependency) }])) };
test('현재 정확한 집합은 package 수와 advisory 수를 구분한다', () => { assert.deepEqual(verifyDependencyPolicy(audit, lock, policy, '2026-10-22'), { affectedPackages: 20, advisoryEntries: 60, p1: 0 }); });
for (const [name, change] of [
  ['새 advisory', a => a.vulnerabilities.undici.via[0].source++],
  ['영향 범위 변경', a => a.vulnerabilities.undici.via[0].range += ' || 99.0.0'],
  ['심각도 변경', a => a.vulnerabilities.undici.severity = 'critical'],
  ['설치 경로 누락', a => a.vulnerabilities.undici.nodes.pop()],
  ['패키지 누락', a => delete a.vulnerabilities.vite],
  ['통신 오류 응답', a => a.error = { code: 'ENETWORK', summary: 'sensitive sentinel' }],
  ['잘못된 via', a => a.vulnerabilities.undici.via = [null]],
]) test(name + ' 차단', () => { const input = structuredClone(audit); change(input); assert.throws(() => verifyDependencyPolicy(input, lock, policy, '2026-10-22'), /DEPENDENCY_/); });
for (const [name, change] of [
  ['미분류', p => p.assessments.pop()], ['P1', p => p.assessments[0].priority = 'P1'],
  ['owner 누락', p => p.assessments[0].owner = ''], ['설명 누락', p => p.assessments[0].assessment = ''],
  ['중복 검토', p => p.assessments[0] = p.assessments[1]],
]) test(name + ' 원장 차단', () => { const input = structuredClone(policy); change(input); assert.throws(() => verifyDependencyPolicy(audit, lock, input, '2026-10-22'), /DEPENDENCY_/); });
test('검토 기한 만료 차단', () => assert.throws(() => verifyDependencyPolicy(audit, lock, policy, '2026-11-06'), /DEPENDENCY_TRIAGE_INVALID/));
test('lock 설치 버전 변경 차단', () => { const input = structuredClone(lock); input.packages['node_modules/undici'].version = '6.99.0'; assert.throws(() => verifyDependencyPolicy(audit, input, policy, '2026-10-22'), /DEPENDENCY_TRIAGE_CHANGED/); });
test('깨진 audit는 정상 0건이 아니다', () => { for (const input of [null, {}, { auditReportVersion: 2, vulnerabilities: [] }]) assert.throws(() => dependencySnapshot(input, lock), /DEPENDENCY_REPORT_INVALID/); });
