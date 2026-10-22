/** 공개 보고서 파일 하나를 제한된 크기로 읽고 닫힌 스키마를 검사합니다. */
import { open } from 'node:fs/promises';
import { publicArtifactByteLimit, publicArtifactKinds, validatePublicArtifact } from './_lib/public-artifact-policy.mjs';

try {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--kind' || !publicArtifactKinds.includes(args[1]) || args[2] !== '--file' || !args[3] || args[3].startsWith('--')) throw new Error('ARGUMENT');
  const handle = await open(args[3], 'r');
  let bytes;
  try {
    if (!(await handle.stat()).isFile()) throw new Error('FILE');
    bytes = Buffer.alloc(publicArtifactByteLimit + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > publicArtifactByteLimit) throw new Error('SIZE');
    bytes = bytes.subarray(0, bytesRead);
  } finally { await handle.close(); }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const report = JSON.parse(text);
  // JSON.parse가 버리는 중복 키에 원문이 숨지 않도록 생산자의 정규 JSON 표기를 요구합니다.
  let compact = '', quoted = false, escaped = false;
  for (const character of text) {
    if (quoted) {
      compact += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') { quoted = true; compact += character; }
    else if (!/[ \t\r\n]/.test(character)) compact += character;
  }
  if (compact !== JSON.stringify(report)) throw new Error('CANONICAL');
  validatePublicArtifact(args[1], report);
  process.stdout.write('PUBLIC_ARTIFACT_SAFE\n');
} catch {
  // 경로·본문·예외 메시지는 공개 작업 로그로 복제하지 않습니다.
  process.stderr.write('PUBLIC_ARTIFACT_REJECTED\n'); process.exitCode = 1;
}
