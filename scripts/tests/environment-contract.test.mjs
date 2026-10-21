/**
 * 환경 계약의 변경 실패 조건을 합성 소스로 재현합니다. 앱·DB·실제 환경 파일을 실행/조회하지 않습니다.
 * 일반식 별칭·미등록 이름·안전하지 않은 예시·정본 문서 drift를 실제 검사 함수에 전달합니다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { environmentInventory } from "../_lib/environment-inventory.mjs";
import { collectEnvironmentReferences, renderEnvironmentReference, validateEnvironmentContract } from "../_lib/environment-contract.mjs";

const record = (name) => structuredClone(environmentInventory.variables.find((entry) => entry.name === name));
const crons = [{ path: "/api/cron/cleanup-rate-limits", schedule: "0 3 * * *" }];

/** 작은 독립 계약을 구성하여 실제 저장소 문서의 변경 없이 회귀 변형을 검증합니다. */
function fixture() {
  const inventory = { variables: [record("AUTH_GOOGLE_ID"), record("ACADEMIC_ENABLED"), record("HRA_CONTENT_WRITES_STOPPED")], dynamicAccess: [] };
  return {
    inventory,
    sources: [
      { path: "src/config.tsx", text: 'export const id = process.env.AUTH_GOOGLE_ID; export const enabled = process.env.ACADEMIC_ENABLED; export const view = <div>합성 화면</div>;' },
      { path: "scripts/cleanup-fixture.mjs", text: "export const stopped = process.env.HRA_CONTENT_WRITES_STOPPED;" },
    ],
    example: "AUTH_GOOGLE_ID=\nACADEMIC_ENABLED=false\n# HRA_CONTENT_WRITES_STOPPED=\n",
    document: renderEnvironmentReference(inventory), crons,
  };
}

test("정상 TSX·운영 명령과 false/빈 예시 계약은 통과한다", () => {
  assert.deepEqual(validateEnvironmentContract(fixture()), []);
});

test("주석과 문자열에 적힌 환경 이름을 실행 소비로 오인하지 않는다", () => {
  const collected = collectEnvironmentReferences([{ path: "src/example.ts", text: '// process.env.NOT_USED\nexport const note = "process.env.ALSO_NOT_USED";' }]);
  assert.equal(collected.references.size, 0);
  assert.deepEqual(collected.errors, []);
});

test("문자열 인덱스 표기도 직접 이름으로 수집한다", () => {
  const input = fixture();
  input.sources[0].text = input.sources[0].text.replace("process.env.AUTH_GOOGLE_ID", 'process["env"]["AUTH_GOOGLE_ID"]');
  assert.deepEqual(validateEnvironmentContract(input), []);
});

const failures = {
  "새 앱 환경변수": (input) => { input.sources[0].text += " const added = process.env.NEW_UNDECLARED_SETTING;"; },
  "새 운영 명령 환경변수": (input) => { input.sources[1].text += " const added = process.env.NEW_OPERATOR_SETTING;"; },
  "소스에서 제거한 이름": (input) => { input.sources[0].text = "export const enabled = process.env.ACADEMIC_ENABLED;"; },
  "목록에서 제거한 이름": (input) => { input.inventory.variables.shift(); },
  "계산식 환경 이름": (input) => { input.sources[0].text += " const added = process.env[settingName];"; },
  "전체 환경 별칭": (input) => { input.sources[0].text += " const environment = process.env;"; },
  "환경 구조 분해": (input) => { input.sources[0].text += " const { AUTH_SECRET } = process.env;"; },
  "process 별칭": (input) => { input.sources[0].text += " const alias = process; const added = alias.env.HIDDEN;"; },
  "객체로 process 별칭 전달": (input) => { input.sources[0].text += " const alias = { process };"; },
  "함수로 process 별칭 반환": (input) => { input.sources[0].text += " function hidden() { return process; }"; },
  "process 구조 분해": (input) => { input.sources[0].text += " const { env } = process;"; },
  "process 계산식 속성": (input) => { input.sources[0].text += " const added = process[propertyName].HIDDEN;"; },
  "process 모듈 별칭": (input) => { input.sources[0].text += ' import { env as hidden } from "node:process";'; },
  "process require 우회": (input) => { input.sources[0].text += ' const hidden = require("node:process");'; },
  "process 동적 import 우회": (input) => { input.sources[0].text += ' const hidden = import("node:process");'; },
  "process 재수출 우회": (input) => { input.sources[0].text += ' export { env } from "node:process";'; },
  "출처를 알 수 없는 env 객체": (input) => { input.sources[0].text += ' const hidden = getConfiguration().env.NEW_SETTING;'; },
  "전역 process 우회": (input) => { input.sources[0].text += " const added = globalThis.process.env.HIDDEN;"; },
  "전역 process 인덱스 우회": (input) => { input.sources[0].text += ' const added = globalThis["process"].env.HIDDEN;'; },
  "전체 환경 spread": (input) => { input.sources[1].text += " const added = {...process.env};"; },
  "gate 활성화 예시": (input) => { input.example = input.example.replace("ACADEMIC_ENABLED=false", "ACADEMIC_ENABLED=true"); },
  "운영 확인 flag의 위험한 예시": (input) => { input.example = input.example.replace("HRA_CONTENT_WRITES_STOPPED=", "HRA_CONTENT_WRITES_STOPPED=1"); },
  "예시에만 추가한 이름": (input) => { input.example += "NEW_UNDECLARED_SETTING=\n"; },
  "중복 예시": (input) => { input.example += "AUTH_GOOGLE_ID=\n"; },
  "필수 metadata 누락": (input) => { delete input.inventory.variables[0].requiredWhen; },
  "비밀 여부 metadata 누락": (input) => { delete input.inventory.variables[0].secret; },
  "임의 SDK 예외로 미사용 이름 유지": (input) => { input.inventory.variables[0].implicit = true; input.inventory.variables[0].owner = "unreviewed-sdk"; },
  "생성 문서 변조": (input) => { input.document = input.document.replace("환경변수 계약 목록", "수정한 별도 목록"); },
  "학사 cleanup 자동 예약": (input) => { input.crons = [...input.crons, { path: "/api/cron/cleanup-academic-uploads", schedule: "0 4 * * *" }]; },
};
for (const [name, mutate] of Object.entries(failures)) {
  test(`계약 위반 거부: ${name}`, () => {
    const input = fixture(); mutate(input);
    assert.ok(validateEnvironmentContract(input).length > 0);
  });
}

test("민감한 예시 값이 오류 메시지에 복사되지 않는다", () => {
  const input = fixture();
  const sentinel = "synthetic-private-sentinel-never-a-real-secret";
  input.example += `AUTH_SECRET=${sentinel}\n`;
  const errors = validateEnvironmentContract(input);
  assert.ok(errors.length > 0);
  assert.ok(errors.every((error) => !error.includes(sentinel)));
});

for (const name of ["RESOURCE_PRIVATE_BLOB_HOST", "ACADEMIC_APPROVER_USER_ID", "AUTH_GOOGLE_ID", "AUTH_URL", "AUTH_TRUST_HOST", "AUTH_SECRET", "DATABASE_URL"]) {
  test(`metadata와 예시를 함께 바꿔도 민감/비합성 값을 허용하지 않음: ${name}`, () => {
    const input = fixture();
    // 기존 항목은 중복 추가하지 않고, 직접 소비 항목에는 합성 source read를 준비합니다.
    let entry = input.inventory.variables.find((variable) => variable.name === name);
    if (!entry) {
      entry = record(name);
      input.inventory.variables.push(entry);
    }
    if (!entry.implicit) input.sources[0].text += ` const guarded_${name} = process.env.${name};`;
    const example = () => input.inventory.variables.filter((variable) => variable.example.mode !== "omitted")
      .map((variable) => `${variable.example.mode === "commented" ? "# " : ""}${variable.name}=${variable.example.value}`).join("\n");
    input.example = example();
    input.document = renderEnvironmentReference(input.inventory);
    assert.deepEqual(validateEnvironmentContract(input), [], "안전한 값의 대조군이 먼저 통과해야 합니다.");

    // source·선언 방식·문서는 유효한 상태로 두고 metadata와 예시의 값만 동시에 바꿉니다.
    entry.example.value = "synthetic-disallowed-value";
    input.example = example();
    input.document = renderEnvironmentReference(input.inventory);
    const errors = validateEnvironmentContract(input);
    assert.ok(errors.length > 0);
    assert.ok(errors.every((error) => error.startsWith(`${name}:`)), "다른 계약 오류가 값 정책의 실패를 대신 증명하면 안 됩니다.");
  });
}

test("기존 시스템 복사의 정확한 구조만 허용하며 새 동적 키는 거부한다", () => {
  const input = fixture();
  const exception = structuredClone(environmentInventory.dynamicAccess.find((entry) => entry.names.length));
  input.inventory.dynamicAccess.push(exception);
  input.inventory.variables.push(...exception.names.map(record));
  input.sources.push({ path: exception.path, text: `const inherited = ${exception.expression};` });
  input.document = renderEnvironmentReference(input.inventory);
  assert.deepEqual(validateEnvironmentContract(input), []);
  input.sources.at(-1).text = input.sources.at(-1).text.replace('"PATH"', '"NEW_DYNAMIC_SETTING"');
  assert.ok(validateEnvironmentContract(input).some((error) => error.includes("동적")));
});

test("기존 운영 환경 전달 예외는 같은 파일의 다른 spread를 허용하지 않는다", () => {
  const input = fixture();
  const exception = structuredClone(environmentInventory.dynamicAccess.find((entry) => entry.path === "scripts/migrate-rate-limit-reservations.mjs"));
  input.inventory.dynamicAccess.push(exception);
  input.sources.push({ path: exception.path, text: `const ${exception.expression};` });
  input.document = renderEnvironmentReference(input.inventory);
  assert.deepEqual(validateEnvironmentContract(input), []);
  input.sources.at(-1).text += " const unreviewed = {...process.env};";
  assert.ok(validateEnvironmentContract(input).some((error) => error.includes("동적")));
});

test("공백·주석 차이는 기존 예외를 넓히지 않고 허용한다", () => {
  const exception = environmentInventory.dynamicAccess.find((entry) => entry.names.length);
  const source = { path: exception.path, text: `const inherited = /* 합성 주석 */ ${exception.expression.replaceAll("process.env", "process /* 공백 */ . env")};` };
  assert.deepEqual(collectEnvironmentReferences([source], [exception]).errors, []);
});

test("실제 저장소 계약 CLI는 비밀값을 받지 않아도 소스 검증을 통과한다", () => {
  const result = spawnSync(process.execPath, ["scripts/check-environment-contract.mjs"], { cwd: new URL("../../", import.meta.url), env: {}, encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /계약 검사 통과/);
});
