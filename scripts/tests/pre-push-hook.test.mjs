/** Git ref 변경 입력을 합성해 삭제 전용 push와 일반 push의 빌드 안전망을 검증한다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const hook = new URL('../../.husky/pre-push', import.meta.url).pathname;
const zero = '0'.repeat(40);
const one = '1'.repeat(40);
const deletion = `(delete) ${zero} refs/heads/merged ${one}\n`;
const update = `refs/heads/feature ${one} refs/heads/feature ${zero}\n`;

/** 실제 npm 실행 대신 호출 여부와 종료 코드를 기록한다. */
function runHook(input, npmExit = 0) {
  const directory = mkdtempSync(join(tmpdir(), 'hra-pre-push-test-'));
  const calls = join(directory, 'npm-calls');
  writeFileSync(join(directory, 'npm'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$HRA_HOOK_TEST_CALLS"\nexit "$HRA_HOOK_TEST_EXIT"\n', { mode: 0o700 });
  try {
    const run = spawnSync('sh', ['-e', hook], {
      input, encoding: 'utf8',
      env: { PATH: `${directory}:${process.env.PATH ?? '/usr/bin:/bin'}`, HOME: directory, TMPDIR: directory, LANG: 'C', HRA_HOOK_TEST_CALLS: calls, HRA_HOOK_TEST_EXIT: String(npmExit) },
    });
    return { status: run.status, output: run.stdout + run.stderr, calls: existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n') : [] };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('삭제 ref만 있으면 제품 빌드를 반복하지 않는다', () => {
  for (const input of [deletion, deletion + `(delete) ${zero} refs/tags/v1 ${one}\n`, `(delete) ${'0'.repeat(64)} refs/heads/merged ${'1'.repeat(64)}\n`]) {
    const result = runHook(input);
    assert.equal(result.status, 0);
    assert.deepEqual(result.calls, []);
    assert.match(result.output, /삭제/);
  }
});

test('새 브랜치 push와 갱신 push는 계속 빌드한다', () => {
  for (const input of [update, `refs/heads/feature ${one} refs/heads/feature ${one}\n`]) {
    const result = runHook(input);
    assert.equal(result.status, 0);
    assert.deepEqual(result.calls, ['run build']);
  }
});

test('삭제와 갱신이 섞이면 빌드하고 실패는 push를 차단한다', () => {
  const result = runHook(deletion + update, 9);
  assert.equal(result.status, 1);
  assert.deepEqual(result.calls, ['run build']);
});

test('비어 있거나 손상된 입력은 실패 차단 방향으로 빌드한다', () => {
  for (const input of ['', deletion.trimEnd(), deletion + update.trimEnd(), `(delete) ${one} refs/heads/merged ${one}\n`, `(delete) 0 refs/heads/merged ${one}\n`, `(delete) ${zero} merged ${one}\n`, `(delete) ${zero} refs/heads/merged ${one} extra\n`]) {
    const result = runHook(input);
    assert.equal(result.status, 0);
    assert.deepEqual(result.calls, ['run build']);
  }
});

test('격리된 실제 Git push에서 생성은 빌드하고 삭제는 생략한다', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hra-pre-push-git-'));
  const remote = join(directory, 'remote.git');
  const local = join(directory, 'local');
  const calls = join(directory, 'npm-calls');
  const environment = { PATH: `${directory}:${process.env.PATH ?? '/usr/bin:/bin'}`, HOME: directory, TMPDIR: directory, LANG: 'C', HRA_HOOK_TEST_CALLS: calls, HRA_HOOK_TEST_EXIT: '0' };
  const git = (args, cwd = directory) => {
    const result = spawnSync('git', args, { cwd, env: environment, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result;
  };
  try {
    mkdirSync(local);
    writeFileSync(join(directory, 'npm'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$HRA_HOOK_TEST_CALLS"\n', { mode: 0o700 });
    git(['init', '--bare', '-q', remote]);
    git(['init', '-q', '-b', 'feature', local]);
    git(['config', 'user.name', 'Hook Test'], local);
    git(['config', 'user.email', 'hook@example.invalid'], local);
    writeFileSync(join(local, 'fixture.txt'), 'fixture\n');
    git(['add', 'fixture.txt'], local);
    git(['commit', '-qm', 'fixture'], local);
    git(['remote', 'add', 'origin', remote], local);
    writeFileSync(join(local, '.git/hooks/pre-push'), `#!/bin/sh\nset -e\n${readFileSync(hook, 'utf8')}`, { mode: 0o700 });

    git(['push', '-u', 'origin', 'feature'], local);
    assert.equal(readFileSync(calls, 'utf8').trim(), 'run build');
    writeFileSync(calls, '');
    const deletionResult = git(['push', 'origin', '--delete', 'feature'], local);
    assert.equal(readFileSync(calls, 'utf8'), '');
    assert.match(deletionResult.stdout + deletionResult.stderr, /삭제/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
