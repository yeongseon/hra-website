/** 설치 의미 대응표를 Git·원문 inventory와 연결하는 읽기 전용 CLI입니다. DB·관리 모듈을 실행하지 않습니다. */
import { execFileSync } from 'node:child_process';
import { constants, lstatSync, fstatSync, openSync, closeSync, readSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateInstallationContract } from './_lib/db-installation-contract.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let total = 0;
/** 상대 경로의 모든 구간·UTF-8·크기를 검사하고 링크 밖 원문을 읽지 않습니다. */
function read(file) {
  if (typeof file !== 'string' || file.includes('\\') || file.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('PATH');
  const absolute = resolve(root, file);
  if (!absolute.startsWith(root + sep)) throw new Error('PATH');
  let current = root;
  for (const part of file.split('/')) { current = resolve(current, part); if (lstatSync(current).isSymbolicLink()) throw new Error('LINK'); }
  if (!lstatSync(absolute).isFile() || lstatSync(absolute).size > 2 * 1024 * 1024) throw new Error('SIZE');
  if (!Number.isInteger(constants.O_NOFOLLOW)) throw new Error('NOFOLLOW');
  const descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!fstatSync(descriptor).isFile()) throw new Error('FILE');
    const bytes = Buffer.alloc(2 * 1024 * 1024 + 1); let count = 0;
    while (count < bytes.length) { const length = readSync(descriptor, bytes, count, bytes.length - count, count); if (!length) break; count += length; }
    total += count; if (count > 2 * 1024 * 1024 || total > 16 * 1024 * 1024) throw new Error('SIZE');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count));
  } finally { closeSync(descriptor); }
}
/** 중복 JSON 키로 사라지는 정보를 허용하지 않으며 공백 이외 자동 정규화는 하지 않습니다. */
function json(file) {
  const source = read(file), value = JSON.parse(source); let compact = '', quoted = false, escaped = false;
  for (const character of source) {
    if (quoted) { compact += character; if (escaped) escaped = false; else if (character === '\\') escaped = true; else if (character === '"') quoted = false; }
    else if (character === '"') { quoted = true; compact += character; }
    else if (!/[ \t\r\n]/.test(character)) compact += character;
  }
  if (compact !== JSON.stringify(value)) throw new Error('JSON');
  return value;
}
try {
  if (process.argv.length !== 2) throw new Error('ARGUMENTS');
  const trackedPaths = execFileSync('git', ['ls-files', '-z'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000, maxBuffer: 4 * 1024 * 1024 }).toString('utf8').split('\0').filter(Boolean);
  if (!trackedPaths.includes('scripts/db/installation-contract.json')) throw new Error('CONTRACT_UNTRACKED');
  const inventory = json('scripts/db/source-inventory.json'), contract = json('scripts/db/installation-contract.json');
  // 기존 검사기가 경로·role·raw hash·predecessor·Git 발견 범위를 계속 단독 소유합니다.
  read('scripts/check-db-source-inventory.mjs'); read('scripts/_lib/db-source-inventory.mjs');
  try { execFileSync(process.execPath, [resolve(root, 'scripts/check-db-source-inventory.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 1024 * 1024 }); }
  catch { process.stderr.write('INSTALL_SOURCE_INVENTORY_INVALID\n'); process.exitCode = 1; }
  if (!process.exitCode) {
    const files = new Set([contract?.schemaExport?.entry, ...(contract?.schemaExport?.evidence ?? []).map(entry => entry?.file)]);
    for (const source of contract?.sources ?? []) for (const evidence of source?.evidence ?? []) files.add(evidence?.file);
    for (const fixture of contract?.fixtures ?? []) { files.add(fixture?.file); for (const evidence of fixture?.evidence ?? []) files.add(evidence?.file); }
    const evidenceLineCounts = {};
    for (const file of files) { if (typeof file !== 'string' || !trackedPaths.includes(file)) throw new Error('EVIDENCE'); evidenceLineCounts[file] = read(file).split('\n').length; }
    const summary = validateInstallationContract({ contract, inventory, trackedPaths, evidenceLineCounts });
    process.stdout.write(`${JSON.stringify({ code: 'INSTALLATION_CONTRACT_CHECKED', ...summary })}\n`);
    if (!summary.ok) process.exitCode = 1;
  }
} catch {
  process.stderr.write('INSTALLATION_CONTRACT_FAILED\n'); process.exitCode = 1;
}
