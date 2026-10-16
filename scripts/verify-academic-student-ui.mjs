/** 합성 계정·격리 PostgreSQL·실제 Next로 학생 조회/완료 UI를 검증한다. 기본 실행은 Blob에 접속하지 않고 명시된 공급자 QA에서만 실제 업로드를 사용한다. */
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createQaPostgres, installQaFixture, qaUsers, qaPassword } from "../tests/support/resource-qa-postgres.mjs";
const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const allowedEnvironment = Object.fromEntries(["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
const provider = process.env.HRA_ACADEMIC_UI_PROVIDER_QA === "true";
const host = provider ? process.env.ACADEMIC_SUBMISSION_BLOB_HOST : undefined;
const token = provider ? process.env.ACADEMIC_SUBMISSION_READ_WRITE_TOKEN : undefined;
let cluster, server, serverDone, manifestPath;
try {
  if (provider && (!host || !/^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/.test(host) || !token)) throw new Error("실제 비공개 공급자 설정이 필요합니다.");
  if (provider) { manifestPath = join(mkdtempSync(join(tmpdir(), "hra-student-ui-manifest-")), "fixture.json"); writeFileSync(manifestPath, JSON.stringify({ host, objects: [] }), { mode: 0o600 }); console.log(`QA 원장 보관: ${manifestPath}`); }
  cluster = createQaPostgres(process.env.HRA_TEST_PG_BIN); installQaFixture(cluster, "https://qa.invalid/unused.pdf");
  cluster.sql("CREATE TABLE cohorts(id uuid PRIMARY KEY); CREATE TABLE schedule_events(id uuid PRIMARY KEY,cohort_id uuid REFERENCES cohorts(id)); CREATE TABLE schedule_sessions(id uuid PRIMARY KEY,schedule_event_id uuid REFERENCES schedule_events(id));");
  for (const name of ["academic-students", "academic-assignments", "academic-submissions"]) cluster.sql(readFileSync(join(repository, `scripts/migrate-${name}.sql`), "utf8"));
  const cohort = randomUUID(), student = randomUUID(), completed = randomUUID(), open = randomUUID(), upload = randomUUID(), replacement = randomUUID();
  cluster.sql(`INSERT INTO cohorts VALUES('${cohort}'); INSERT INTO academic_students(id,user_id,display_name) VALUES('${student}','${qaUsers.MEMBER.id}','학생 화면 시험');
    INSERT INTO cohort_enrollments(student_id,cohort_id) VALUES('${student}','${cohort}');
    INSERT INTO assignments(id,cohort_id,title,due_at,created_by_user_id) VALUES('${completed}','${cohort}','완료 결과 시험',clock_timestamp()+interval '1 day','${qaUsers.ADMIN.id}'),('${open}','${cohort}','빈 파일 시험',clock_timestamp()+interval '1 day','${qaUsers.ADMIN.id}'),('${upload}','${cohort}','실제 업로드 시험',clock_timestamp()+interval '1 day','${qaUsers.ADMIN.id}'),('${replacement}','${cohort}','파일 교체 시험',clock_timestamp()+interval '1 day','${qaUsers.ADMIN.id}');
    SELECT publish_academic_assignment('${completed}','${qaUsers.ADMIN.id}'); SELECT publish_academic_assignment('${open}','${qaUsers.ADMIN.id}'); SELECT publish_academic_assignment('${upload}','${qaUsers.ADMIN.id}'); SELECT publish_academic_assignment('${replacement}','${qaUsers.ADMIN.id}');`);
  const target = cluster.sql(`SELECT id FROM assignment_targets WHERE assignment_id='${completed}';`);
  const intent = cluster.sql(`INSERT INTO assignment_upload_intents(assignment_target_id,user_id,storage_key,expires_at) VALUES('${target}','${qaUsers.MEMBER.id}','assignments/isolated-ui.pdf',clock_timestamp()+interval '1 hour') RETURNING id;`);
  cluster.sql(`SELECT verify_academic_assignment_upload('${intent}','${qaUsers.MEMBER.id}','제출.pdf','application/pdf',1024,'${"a".repeat(64)}'); SELECT finalize_academic_assignment_submission('${target}','${qaUsers.MEMBER.id}','${intent}',gen_random_uuid());`);
  if (provider) for (const name of ["academic-upload-authorizations", "academic-submission-finalization"]) cluster.sql(readFileSync(join(repository, `scripts/migrate-${name}.sql`), "utf8"));
  const listener = createServer(); await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const baseUrl = `http://127.0.0.1:${port}`;
  const environment = { ...allowedEnvironment, ...cluster.environment, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", AUTH_SECRET: randomBytes(48).toString("hex"), AUTH_TRUST_HOST: "true", AUTH_URL: baseUrl, NEXTAUTH_URL: baseUrl, NEXT_PUBLIC_APP_URL: baseUrl,
    ACADEMIC_ENABLED: "true", ACADEMIC_UPLOADS_ENABLED: provider ? "true" : "false", ACADEMIC_ENROLLMENT_WRITES_ENABLED: provider ? "true" : "false",
    ...(provider ? { ACADEMIC_SUBMISSION_BLOB_HOST: host, ACADEMIC_SUBMISSION_READ_WRITE_TOKEN: token, VERCEL_BLOB_CALLBACK_URL: "https://academic-upload-qa.invalid/api/academic/uploads" } : {}),
    NODE_OPTIONS: `--import=${JSON.stringify(join(repository, "tests/support/resource-qa-preload.mjs"))}` };
  server = spawn(process.execPath, [join(repository, "node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: repository, env: environment, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.resume(); server.stderr.resume();
  let exited = false; serverDone = new Promise(resolve => { server.once("error", () => { exited = true; resolve(); }); server.once("exit", () => { exited = true; resolve(); }); });
  let ready = false;
  for (let n = 0; n < 180 && !exited; n++) { try { const response = await fetch(`${baseUrl}/api/auth/csrf`, { signal: AbortSignal.timeout(5000) }); if (response.ok) { await response.body?.cancel(); ready = true; break; } } catch { ready = false; } await delay(250); }
  if (!ready) throw new Error("격리 Next 서버 준비 실패");
  const child = spawn(process.execPath, [join(repository, "node_modules/@playwright/test/cli.js"), "test", "tests/e2e/academic-student-ui.spec.ts", "--workers=1"], { cwd: repository, env: { ...allowedEnvironment, PLAYWRIGHT_BASE_URL: baseUrl, HRA_ACADEMIC_UI_QA: "true", HRA_ACADEMIC_UI_PROVIDER_QA: String(provider), HRA_ACADEMIC_UI_UPLOAD_ID: upload, HRA_ACADEMIC_UI_REPLACEMENT_ID: replacement, ...(manifestPath ? { HRA_ACADEMIC_UI_MANIFEST_PATH: manifestPath } : {}), HRA_ACADEMIC_UI_EMAIL: qaUsers.MEMBER.email, HRA_ACADEMIC_UI_PASSWORD: qaPassword, HRA_ACADEMIC_UI_OPEN_ID: open }, stdio: "inherit" });
  const code = await new Promise(resolve => { child.once("error", () => resolve(1)); child.once("exit", resolve); });
  if (code !== 0) throw new Error("학생 화면 브라우저 검증 실패");
  console.log("PASS 격리 DB·실제 credentials·학생 목록/완료/새로고침/모바일 파일 오류");
  if (provider) console.log("PASS 실제 공급자 직접 업로드·최종화 응답 유실·동일 요청 복구·새로고침·위장 PDF 안전 교체");
} catch { console.error("학생 UI QA 실패. 운영 정보나 SQL 원문을 출력하지 않습니다."); process.exitCode = 1; }
finally {
  if (server) { try { process.kill(-server.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") process.exitCode = 1; } await Promise.race([serverDone, delay(5000)]); if (server.exitCode === null) { try { process.kill(-server.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") process.exitCode = 1; } } }
  cluster?.close();
}
