// @vitest-environment node
/** 실제 권한 SQL·감사 원자성·역할과 학적 철회·migration 카탈로그를 격리 PostgreSQL에서 검증합니다. */
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { buildAuthorizedSubmissionFileRead } from "@/features/academics/submission-files/data";
import { academicSubmissionFileReads } from "@/lib/db/academic-file-accesses";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { bindParameters, createPsqlTransport } from "../support/neon-psql-transport.mjs";
import { fileQaIdentities, fileQaIds, installSubmissionFileIdentities, installSubmissionFileMigrations,
  seedSubmissionFileRows } from "../support/academic-submission-file-fixture.mjs";
import type { SubmissionFileReader } from "@/features/academics/submission-files/access";

const dialect = new PgDialect();
const owner: SubmissionFileReader = { userId: fileQaIdentities.owner.id, scope: "OWNER", approverId: null };
const manager: SubmissionFileReader = { userId: fileQaIdentities.approver.id, scope: "MANAGEMENT", approverId: fileQaIdentities.approver.id };

describe.skipIf(!process.env.HRA_TEST_PG_BIN)("개인 제출 파일 실제 PostgreSQL 권한", () => {
  let cluster: ReturnType<typeof createQaPostgres>;
  let execute: ReturnType<typeof createPsqlTransport>;
  let fixture: ReturnType<typeof seedSubmissionFileRows>;
  const read = (reader = owner, submissionId = fixture.owner.submissionId, fileId = fixture.owner.fileId) => {
    const query = dialect.sqlToQuery(buildAuthorizedSubmissionFileRead(reader, submissionId, fileId));
    return execute({ query: query.sql, params: query.params.map((value) => value === null ? null : String(value)) });
  };
  beforeAll(() => {
    cluster = createQaPostgres(process.env.HRA_TEST_PG_BIN);
    installSubmissionFileIdentities(cluster);
    installSubmissionFileMigrations(cluster);
    cluster.sql(readFileSync("scripts/migrate-academic-submission-file-reads.sql", "utf8"));
    execute = createPsqlTransport(cluster.environment);
  }, 30_000);
  beforeEach(() => { fixture = seedSubmissionFileRows(cluster); });
  afterAll(() => cluster?.close());

  it("감사 Drizzle 컬럼·FK와 SQL 카탈로그가 일치하고 migration 재실행도 보존한다", async () => {
    const config = getTableConfig(academicSubmissionFileReads);
    const columns = JSON.parse(cluster.sql("SELECT json_agg(json_build_object('name',attname,'type',format_type(atttypid,atttypmod),'required',attnotnull) ORDER BY attnum) FROM pg_attribute WHERE attrelid='academic_submission_file_reads'::regclass AND attnum>0 AND NOT attisdropped"));
    expect(columns).toEqual(config.columns.map((column) => ({ name: column.name, type: column.getSQLType(), required: column.notNull })));
    for (const foreignKey of config.foreignKeys) expect(cluster.sql(`SELECT confdeltype FROM pg_constraint WHERE conname='${foreignKey.getName()}'`)).toBe("r");
    await read();
    cluster.sql(readFileSync("scripts/migrate-academic-submission-file-reads.sql", "utf8"));
    expect(cluster.sql("SELECT count(*) FROM academic_submission_file_reads")).toBe("1");
  });

  it("본인 현재 MEMBER와 정확 지정 FACULTY 관리 승인자만 파일·감사 행을 얻는다", async () => {
    expect((await read()).rows).toHaveLength(1);
    expect((await read(manager)).rows).toHaveLength(1);
    expect(cluster.sql("SELECT string_agg(access_scope,',' ORDER BY authorized_at) FROM academic_submission_file_reads")).toBe("OWNER,MANAGEMENT");
  });

  it.each(["peer", "otherCohort", "admin", "otherFaculty", "pending"] as const)("%s는 같은 ID를 알아도 허용 행·감사가 없다", async (name) => {
    expect((await read({ userId: fileQaIdentities[name].id, scope: "OWNER", approverId: null })).rows).toEqual([]);
    expect(cluster.sql("SELECT count(*) FROM academic_submission_file_reads")).toBe("0");
  });

  it("ADMIN 역할이나 management scope 문자열만으로 관리 grant를 만들 수 없다", async () => {
    expect((await read({ userId: fileQaIdentities.admin.id, scope: "MANAGEMENT", approverId: manager.userId })).rows).toEqual([]);
    expect((await read({ userId: fileQaIdentities.otherFaculty.id, scope: "MANAGEMENT", approverId: manager.userId })).rows).toEqual([]);
  });

  it("없는 파일·다른 제출의 파일·타인의 제출 ID는 같은 빈 결과이고 감사도 없다", async () => {
    const absent = "90000000-0000-4000-8000-000000000001";
    expect((await read(owner, fixture.owner.submissionId, absent)).rows).toEqual([]);
    expect((await read(owner, fixture.owner.submissionId, fixture.peer.fileId)).rows).toEqual([]);
    expect((await read(owner, fixture.peer.submissionId, fixture.peer.fileId)).rows).toEqual([]);
    expect(cluster.sql("SELECT count(*) FROM academic_submission_file_reads")).toBe("0");
  });

  it("현재 DB 역할 강등은 오래된 MEMBER 입력과 관리 입력도 즉시 거부한다", async () => {
    cluster.sql(`UPDATE users SET role='PENDING' WHERE id IN ('${owner.userId}','${manager.userId}')`);
    expect((await read()).rows).toEqual([]);
    expect((await read(manager)).rows).toEqual([]);
  });

  it("학적 종료 뒤 본인은 차단하되 지정 관리자는 보존 제출을 감사 후 읽는다", async () => {
    cluster.sql(`UPDATE cohort_enrollments SET ended_at=clock_timestamp() WHERE id='${fileQaIds.enrollment}'`);
    expect((await read()).rows).toEqual([]);
    expect((await read(manager)).rows).toHaveLength(1);
  });

  it("계정 연결 해제도 과거 ID의 소유권을 유지하지 않는다", async () => {
    // 실제 #148은 최종 제출 뒤 연결 해제를 금지합니다. 이 fixture만 미래 정정 상황을 강제로 재현합니다.
    cluster.sql(`ALTER TABLE academic_students DISABLE TRIGGER academic_submission_binding_guard;
      UPDATE academic_students SET user_id=NULL WHERE id='${fileQaIds.student}';
      ALTER TABLE academic_students ENABLE TRIGGER academic_submission_binding_guard;`);
    expect((await read()).rows).toEqual([]);
    expect((await read(manager)).rows).toHaveLength(1);
  });

  it("CLOSED 마감 과제도 본인 최종 제출의 읽기는 유지한다", async () => {
    cluster.sql(`UPDATE assignments SET status='CLOSED' WHERE id='${fileQaIds.assignment}'`);
    expect((await read()).rows).toHaveLength(1);
  });

  it("학적 철회 트랜잭션의 잠금 대기 뒤에는 옛 snapshot으로 허가·감사를 만들지 않는다", async () => {
    const client = (name: string) => {
      const child = spawn(join(process.env.HRA_TEST_PG_BIN!, "psql"), ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"], {
        env: { ...cluster.environment, NODE_ENV: "test", PGAPPNAME: name }, stdio: ["pipe", "pipe", "pipe"],
      });
      let output = "";
      child.stdout.on("data", (chunk) => { output += String(chunk); });
      child.stderr.resume();
      const done = new Promise<number | null>((resolve, reject) => { child.once("close", resolve); child.once("error", reject); });
      return { child, done, output: () => output.trim() };
    };
    const waitFor = async (query: string) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (cluster.sql(query) === "1") return;
        await delay(20);
      }
      throw new Error("격리 DB 경합 상태를 확인하지 못했습니다.");
    };
    const revoke = client("qa_file_revoke");
    const reading = client("qa_file_read");
    try {
      revoke.child.stdin.write(`BEGIN; UPDATE cohort_enrollments SET ended_at=clock_timestamp() WHERE id='${fileQaIds.enrollment}';\n`);
      await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='qa_file_revoke' AND state='idle in transaction'");
      const query = dialect.sqlToQuery(buildAuthorizedSubmissionFileRead(owner, fixture.owner.submissionId, fixture.owner.fileId));
      reading.child.stdin.end(`${bindParameters(query.sql, query.params)};\n`);
      await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='qa_file_read' AND wait_event_type='Lock'");
      revoke.child.stdin.end("COMMIT;\n");
      expect(await revoke.done).toBe(0);
      expect(await reading.done).toBe(0);
      expect(reading.output()).toBe("");
      expect(cluster.sql("SELECT count(*) FROM academic_submission_file_reads")).toBe("0");
    } finally {
      for (const connection of [revoke, reading]) {
        if (!connection.child.stdin.writableEnded) connection.child.stdin.end("ROLLBACK;\n");
        if (connection.child.exitCode === null) { connection.child.kill(); await connection.done; }
      }
    }
  }, 15_000);

  it("감사 INSERT 실패 시 허가 파일 메타도 반환되지 않고 부분 감사가 없다", async () => {
    cluster.sql("CREATE FUNCTION fail_file_read_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'qa_audit_failed'; END $$; CREATE TRIGGER qa_fail_file_read_audit BEFORE INSERT ON academic_submission_file_reads FOR EACH ROW EXECUTE FUNCTION fail_file_read_audit();");
    try {
      await expect(read()).rejects.toThrow();
      expect(cluster.sql("SELECT count(*) FROM academic_submission_file_reads")).toBe("0");
    } finally { cluster.sql("DROP TRIGGER qa_fail_file_read_audit ON academic_submission_file_reads; DROP FUNCTION fail_file_read_audit();"); }
  });

  it("감사는 이름·저장 키·URL 없이 append-only이며 구조 drift를 수용하지 않는다", async () => {
    await read();
    expect(cluster.sql("SELECT string_agg(column_name,',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_name='academic_submission_file_reads'"))
      .toBe("id,actor_user_id,submission_id,file_id,access_scope,authorized_at");
    expect(() => cluster.sql("UPDATE academic_submission_file_reads SET access_scope='OWNER'")).toThrow();
    expect(() => cluster.sql("DELETE FROM academic_submission_file_reads")).toThrow();
    cluster.sql("ALTER TABLE academic_submission_file_reads ADD COLUMN unexpected text");
    try { expect(() => cluster.sql(readFileSync("scripts/migrate-academic-submission-file-reads.sql", "utf8"))).toThrow(); }
    finally { cluster.sql("ALTER TABLE academic_submission_file_reads DROP COLUMN unexpected"); }
  });
});
