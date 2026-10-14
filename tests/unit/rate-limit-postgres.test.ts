// @vitest-environment node
/**
 * 요청 제한 예약 함수의 실제 PostgreSQL 동시성 검증 (#121).
 * 테스트 전용 임시 클러스터와 유닉스 소켓만 사용하고 종료 시 모두 정리합니다.
 */
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const bin = process.env.HRA_TEST_PG_BIN;
const execFileAsync = promisify(execFile);

describe.skipIf(!bin)("요청 제한 예약 PostgreSQL 동시성", () => {
  let root: string;
  let started = false;
  let psqlArgs: string[];
  const program = (name: string) => join(bin!, name);
  const run = (statement: string) => execFileSync(program("psql"), psqlArgs, {
    input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  const runAsync = async (statement: string) => {
    const { stdout } = await execFileAsync(program("psql"), [...psqlArgs, "-c", statement], { encoding: "utf8" });
    return stdout.trim();
  };

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "hra-rate-limit-"));
    execFileSync(program("initdb"), ["-D", join(root, "data"), "-A", "trust", "-U", "hra_test", "--no-locale", "-E", "UTF8"], { stdio: "pipe" });
    execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-l", join(root, "server.log"),
      "-o", `-h '' -k ${root} -p 55464`, "-w", "start"], { stdio: "pipe" });
    started = true;
    psqlArgs = ["-X", "-h", root, "-p", "55464", "-U", "hra_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
    run("CREATE TABLE application_submissions (id uuid PRIMARY KEY);");
    const migration = readFileSync("scripts/sql/rate-limit-reservations.sql", "utf8");
    run(migration);
    run(migration);
  }, 30000);

  afterAll(() => {
    try {
      if (started) execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
    } finally {
      if (root) rmSync(root, { recursive: true, force: true });
    }
  });

  const key = (character: string) => character.repeat(64);

  it("동일 키에 동시에 12개 요청이 와도 정확히 5개만 허용한다", async () => {
    const statement = `SELECT allowed FROM reserve_rate_limit(ARRAY['login-pair'], ARRAY['${key("a")}'], ARRAY[5], ARRAY[900]);`;
    const results = await Promise.all(Array.from({ length: 12 }, () => runAsync(statement)));

    expect(results.filter((result) => result === "t")).toHaveLength(5);
    expect(results.filter((result) => result === "f")).toHaveLength(7);
  }, 15000);

  it("서로 다른 조합도 공유 IP 상한을 함께 지킨다", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => {
      const pairKey = index.toString(16).padStart(64, "0");
      return runAsync(`SELECT allowed FROM reserve_rate_limit(
        ARRAY['login-pair', 'login-ip'],
        ARRAY['${pairKey}', '${key("b")}'],
        ARRAY[5, 3], ARRAY[900, 900]
      );`);
    }));

    expect(results.filter((result) => result === "t")).toHaveLength(3);
    expect(results.filter((result) => result === "f")).toHaveLength(5);
    expect(run("SELECT count(*) FROM rate_limit_events WHERE scope = 'login-ip';")).toBe("3");
  }, 15000);

  it("연결된 지원서를 지우면 그 예약 이벤트도 함께 삭제한다", () => {
    const submissionId = "11111111-1111-4111-8111-111111111111";
    run(`INSERT INTO application_submissions VALUES ('${submissionId}');`);
    const reservationId = run(`SELECT reservation_id FROM reserve_rate_limit(
      ARRAY['submission-ip'], ARRAY['${key("c")}'], ARRAY[5], ARRAY[3600]
    );`);
    run(`UPDATE rate_limit_events SET submission_id = '${submissionId}' WHERE reservation_id = '${reservationId}';`);
    run(`DELETE FROM application_submissions WHERE id = '${submissionId}';`);

    expect(run(`SELECT count(*) FROM rate_limit_events WHERE reservation_id = '${reservationId}';`)).toBe("0");
  });
});
