/** 현재 Git 추적 공개 문서·테스트를 읽고 경로·원문 없이 규칙별 발견 개수만 출력합니다. */
import { execFileSync } from 'node:child_process';
import { lstat, open, realpath } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { summarizePublicSource } from './_lib/public-source-policy.mjs';

const fileLimit = 4 * 1024 * 1024;
const totalLimit = 64 * 1024 * 1024;
const extensions = /\.(?:md|mdx|txt|json|ya?ml|[cm]?js|[cm]?ts|tsx|html|css|sql|csv|py|sh|svg|snap)$/i;
const git = args => execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
let bytesRead = 0;
/** 경로의 모든 구성요소를 검사하고 심볼릭 링크·경로 이탈·큰 파일을 거부합니다. */
async function checkedPath(root, file) {
  if (!file || file.includes('\\') || file.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('PATH');
  const absolute = resolve(root, file);
  if (relative(root, absolute).startsWith(`..${sep}`) || relative(root, absolute) === '..' || absolute === root) throw new Error('PATH');
  let current = root;
  for (const part of file.split('/')) { current = join(current, part); if ((await lstat(current)).isSymbolicLink()) throw new Error('LINK'); }
  return absolute;
}
/** 검증된 텍스트 파일을 제한된 크기로 읽고 UTF-8 오류를 그대로 실패시킵니다. */
async function readChecked(root, file) {
  const absolute = await checkedPath(root, file);
  const handle = await open(absolute, 'r');
  try {
    const stat = await handle.stat(); if (!stat.isFile() || stat.size > fileLimit) throw new Error('FILE');
    const bytes = Buffer.alloc(fileLimit + 1); let count = 0;
    while (count < bytes.length) {
      const result = await handle.read(bytes, count, bytes.length - count, count);
      if (result.bytesRead === 0) break;
      count += result.bytesRead;
    }
    bytesRead += count; if (count > fileLimit || bytesRead > totalLimit) throw new Error('SIZE');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count));
  } finally { await handle.close(); }
}
try {
  if (process.argv.length !== 2) throw new Error('ARGUMENTS');
  const root = process.cwd(); if (await realpath(root) !== root || git(['rev-parse', '--show-toplevel']).trim() !== root) throw new Error('ROOT');
  const paths = git(['ls-files', '-z', '--', 'docs/', 'tests/', 'content/', 'README.md', 'AGENTS.md', '.env.example', '.github/ISSUE_TEMPLATE/', '.github/PULL_REQUEST_TEMPLATE.md']).split('\0').filter(Boolean);
  if (!paths.length || paths.length > 10000 || new Set(paths).size !== paths.length) throw new Error('FILES');
  const ledger = JSON.parse(await readChecked(root, 'security/source-fixtures.json'));
  const files = [];
  for (const file of paths) {
    if (!/^(?:(?:docs|tests|content)\/|\.github\/ISSUE_TEMPLATE\/)/.test(file) && !['README.md', 'AGENTS.md', '.env.example', '.github/PULL_REQUEST_TEMPLATE.md'].includes(file)) throw new Error('SCOPE');
    await checkedPath(root, file);
    // PDF·이미지·폰트 등 바이너리는 이 텍스트 패턴 검사의 범위 밖입니다.
    if (extensions.test(file) || file === '.env.example') files.push({ file, text: await readChecked(root, file) });
  }
  const summary = summarizePublicSource(files, ledger);
  process.stdout.write(`${JSON.stringify({ code: 'PUBLIC_SOURCE_CHECKED', ...summary })}\n`);
  if (summary.findings) process.exitCode = 1;
} catch {
  process.stderr.write('PUBLIC_SOURCE_CHECK_FAILED\n'); process.exitCode = 1;
}
