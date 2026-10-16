// @vitest-environment node
/**
 * #147 과제 정의·공개 스냅샷을 실제 격리 PostgreSQL에서 검증한다.
 * 운영 환경변수를 읽지 않으며 동시 공개·이력 보존·마이그레이션 실패 원자성을 포함한다.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { getTableConfig } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assignments, assignmentTargets } from "@/lib/db/academic-assignments";

const bin = process.env.HRA_TEST_PG_BIN;
const migration = readFileSync("scripts/migrate-academic-assignments.sql", "utf8");
// 모든 ID와 이름은 격리 테스트용 가상 데이터다.
const actor = "10000000-0000-4000-8000-000000000001";
const cohort = "20000000-0000-4000-8000-000000000001";
const otherCohort = "20000000-0000-4000-8000-000000000002";
const student = "30000000-0000-4000-8000-000000000001";
const enrollment = "40000000-0000-4000-8000-000000000001";
const event = "50000000-0000-4000-8000-000000000001";
const session = "60000000-0000-4000-8000-000000000001";
const assignment = "70000000-0000-4000-8000-000000000001";

describe.skipIf(!bin)("과제 정의·공개 대상 스냅샷 PostgreSQL", () => {
  let root: string;
  let started = false;
  let args: string[];
  const program = (name: string) => join(bin!, name);
  const run = (sql: string) => execFileSync(program("psql"), args, {
    input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  const draft = (extra = "") => run(`INSERT INTO assignments
    (id,cohort_id,title,due_at,created_by_user_id ${extra ? ",schedule_event_id,schedule_session_id" : ""})
    VALUES ('${assignment}','${cohort}','과제 제목',clock_timestamp()+interval '1 day','${actor}' ${extra});`);
  const publish = () => run(`SELECT id FROM publish_academic_assignment('${assignment}','${actor}');`);
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "hra-academic-assignments-"));
    execFileSync(program("initdb"), ["-D", join(root,"data"),"-A","trust","-U","hra_test","--no-locale","-E","UTF8"], { stdio:"pipe" });
    execFileSync(program("pg_ctl"), ["-D",join(root,"data"),"-l",join(root,"server.log"),"-o",`-h '' -k ${root} -p 55451`,"-w","start"], { stdio:"pipe" });
    started = true;
    args = ["-X","-h",root,"-p","55451","-U","hra_test","-d","postgres","-v","ON_ERROR_STOP=1","-Atq"];
    run(`CREATE TABLE cohorts (id uuid PRIMARY KEY);
      CREATE TABLE users (id uuid PRIMARY KEY);
      CREATE TABLE schedule_events (id uuid PRIMARY KEY,cohort_id uuid REFERENCES cohorts(id));
      CREATE TABLE schedule_sessions (id uuid PRIMARY KEY,schedule_event_id uuid NOT NULL REFERENCES schedule_events(id) ON DELETE CASCADE);
      INSERT INTO cohorts VALUES ('${cohort}'),('${otherCohort}');
      INSERT INTO users VALUES ('${actor}');
      INSERT INTO schedule_events VALUES ('${event}','${cohort}');
      INSERT INTO schedule_sessions VALUES ('${session}','${event}');`);
    run(readFileSync("scripts/migrate-academic-students.sql","utf8"));
    run(migration);
    run(migration);
  }, 30000);
  beforeEach(() => {
    // TRUNCATE는 테스트 fixture 초기화 전용이다. 애플리케이션 DB 역할에는 허용하지 않는다.
    run(`TRUNCATE assignment_targets,assignments,cohort_enrollments,academic_students;
      UPDATE schedule_events SET cohort_id='${cohort}' WHERE id='${event}';
      UPDATE schedule_sessions SET schedule_event_id='${event}' WHERE id='${session}';
      INSERT INTO academic_students (id,display_name) VALUES ('${student}','학생 가');
      INSERT INTO cohort_enrollments (id,student_id,cohort_id,enrolled_at)
        VALUES ('${enrollment}','${student}','${cohort}',clock_timestamp()-interval '1 day');`);
  });
  afterAll(() => {
    try {
      if (started) execFileSync(program("pg_ctl"), ["-D",join(root,"data"),"-m","immediate","-w","stop"], { stdio:"pipe" });
    } finally { if (root) rmSync(root,{ recursive:true,force:true }); }
  });

  it("신규·재실행 migration과 Drizzle 컬럼·제약·인덱스가 일치한다", () => {
    run(migration);
    for (const table of [assignments,assignmentTargets]) {
      const config = getTableConfig(table);
      const columns = JSON.parse(run(`SELECT json_agg(json_build_object('name',attname,'type',format_type(atttypid,atttypmod),'required',attnotnull) ORDER BY attnum)
        FROM pg_attribute WHERE attrelid='${config.name}'::regclass AND attnum>0 AND NOT attisdropped;`));
      expect(columns).toEqual(config.columns.map(column => ({ name:column.name,
        type:column.getSQLType().replace(/^varchar\(/,"character varying("),required:column.notNull })));
      for (const fk of config.foreignKeys) {
        expect(run(`SELECT confdeltype FROM pg_constraint WHERE conrelid='${config.name}'::regclass AND conname='${fk.getName()}';`)).toBe("r");
      }
      for (const constraint of config.uniqueConstraints) {
        expect(run(`SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='${config.name}'::regclass AND conname='${constraint.getName()}';`))
          .toBe(`UNIQUE (${constraint.columns.map(column=>column.name).join(", ")})`);
      }
      for (const constraint of config.checks) {
        expect(run(`SELECT count(*) FROM pg_constraint WHERE conrelid='${config.name}'::regclass AND conname='${constraint.name}' AND contype='c';`)).toBe("1");
      }
      for (const idx of config.indexes) {
        expect(run(`SELECT count(*) FROM pg_indexes WHERE tablename='${config.name}' AND indexname='${idx.config.name}';`)).toBe("1");
      }
    }
  });

  it("공개는 같은 기수의 유효 학적만 확정하고 KST 정각을 동일 UTC instant로 저장한다", () => {
    run(`INSERT INTO cohort_enrollments (student_id,cohort_id) VALUES ('${student}','${otherCohort}');
      INSERT INTO academic_students (display_name) VALUES ('종료 학생'),('미래 등록');
      INSERT INTO cohort_enrollments (student_id,cohort_id,enrolled_at,ended_at)
        SELECT id,'${cohort}',clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day'
        FROM academic_students WHERE display_name='종료 학생';
      INSERT INTO cohort_enrollments (student_id,cohort_id,enrolled_at)
        SELECT id,'${cohort}',clock_timestamp()+interval '1 day' FROM academic_students WHERE display_name='미래 등록';`);
    draft(`,'${event}','${session}'`);
    run("UPDATE assignments SET due_at='2099-10-16T09:00:00+09:00';");
    expect(publish()).toBe(assignment);
    expect(run("SELECT due_at AT TIME ZONE 'UTC' FROM assignments;")).toBe("2099-10-16 00:00:00");
    expect(run("SELECT count(*) FROM assignment_targets;")).toBe("1");
    expect(run("SELECT bool_and(t.assigned_at=a.published_at AND t.assigned_by_user_id=a.published_by_user_id) FROM assignment_targets t JOIN assignments a ON a.id=t.assignment_id;")).toBe("t");
    expect(publish()).toBe(assignment);
    expect(run("SELECT count(*) FROM assignment_targets;")).toBe("1");
  });

  it("등록 추가·종료 이후에도 기존 대상을 보존하고 직접 대상 조작·학적 이동을 거부한다", () => {
    draft(); publish();
    run(`INSERT INTO academic_students (display_name) VALUES ('나중 등록');
      INSERT INTO cohort_enrollments (student_id,cohort_id) SELECT id,'${cohort}' FROM academic_students WHERE display_name='나중 등록';
      UPDATE cohort_enrollments SET ended_at=clock_timestamp() WHERE id='${enrollment}';`);
    publish();
    expect(run("SELECT count(*) FROM assignment_targets;")).toBe("1");
    for (const query of [
      `UPDATE cohort_enrollments SET cohort_id='${otherCohort}' WHERE id='${enrollment}';`,
      `UPDATE cohort_enrollments SET student_id=(SELECT id FROM academic_students WHERE display_name='나중 등록') WHERE id='${enrollment}';`,
      `DELETE FROM cohort_enrollments WHERE id='${enrollment}';`,
      "UPDATE assignment_targets SET assigned_at=clock_timestamp();",
      "DELETE FROM assignment_targets;",
      `INSERT INTO assignment_targets (assignment_id,enrollment_id,assigned_at,assigned_by_user_id) VALUES ('${assignment}','${enrollment}',clock_timestamp(),'${actor}');`,
    ]) expect(() => run(query)).toThrow();
  });

  it("다른 기수 수업·다른 수업 세션 및 참조 후 수업 기수 이동을 거부한다", () => {
    run(`INSERT INTO schedule_events VALUES (gen_random_uuid(),'${otherCohort}');`);
    expect(() => draft(`,(SELECT id FROM schedule_events WHERE cohort_id='${otherCohort}' LIMIT 1),NULL`)).toThrow();
    expect(() => draft(`,NULL,'${session}'`)).toThrow();
    expect(() => draft(`,(SELECT id FROM schedule_events WHERE cohort_id='${otherCohort}' LIMIT 1),'${session}'`)).toThrow();
    draft(`,'${event}','${session}'`);
    expect(() => run(`UPDATE schedule_events SET cohort_id='${otherCohort}' WHERE id='${event}';`)).toThrow();
    expect(() => run(`UPDATE schedule_sessions SET schedule_event_id=(SELECT id FROM schedule_events WHERE cohort_id='${otherCohort}' LIMIT 1) WHERE id='${session}';`)).toThrow();
    expect(() => run(`DELETE FROM schedule_events WHERE id='${event}';`)).toThrow();
    expect(() => run(`DELETE FROM schedule_sessions WHERE id='${session}';`)).toThrow();
  });

  it("초안 편집·삭제와 공개→종료만 허용하고 공개 후 내용·마감·삭제를 보호한다", () => {
    draft();
    run("UPDATE assignments SET title='정정 제목', instructions='안내';");
    expect(() => run("UPDATE assignments SET status='CLOSED';")).toThrow();
    publish();
    for (const query of ["UPDATE assignments SET title='변경';","UPDATE assignments SET instructions='변경';",
      "UPDATE assignments SET due_at=clock_timestamp()+interval '2 days';",
      `UPDATE assignments SET cohort_id='${otherCohort}';`,"UPDATE assignments SET status='DRAFT';",
      "UPDATE assignments SET published_at=clock_timestamp();","DELETE FROM assignments;",
      `DELETE FROM cohorts WHERE id='${cohort}';`,`DELETE FROM users WHERE id='${actor}';`]) expect(() => run(query)).toThrow();
    run("UPDATE assignments SET status='CLOSED';");
    expect(publish()).toBe(assignment);
    expect(run("SELECT status FROM assignments;")).toBe("CLOSED");
    expect(() => run("UPDATE assignments SET status='PUBLISHED';")).toThrow();
    run(`INSERT INTO assignments (cohort_id,title,created_by_user_id) VALUES ('${otherCohort}','삭제 가능 초안','${actor}');
      DELETE FROM assignments WHERE status='DRAFT';`);
  });

  it("공개 마감 누락·현재/과거·무한 시각을 거부하고 초안으로 남긴다", () => {
    draft();
    for (const due of ["NULL","clock_timestamp()-interval '1 second'","clock_timestamp()","'infinity'::timestamptz"]) {
      if (due.includes("infinity")) expect(() => run(`UPDATE assignments SET due_at=${due};`)).toThrow();
      else {
        run(`UPDATE assignments SET due_at=${due};`);
        expect(publish).toThrow();
      }
      expect(run("SELECT status FROM assignments;")).toBe("DRAFT");
      expect(run("SELECT count(*) FROM assignment_targets;")).toBe("0");
    }
    expect(() => run(`INSERT INTO assignments (cohort_id,title,status,created_by_user_id) VALUES ('${cohort}','직접 공개','PUBLISHED','${actor}');`)).toThrow();
  });

  it("오래된 스냅샷을 쓰는 REPEATABLE READ·SERIALIZABLE 공개는 명시적으로 거부한다", () => {
    draft();
    for (const isolation of ["REPEATABLE READ", "SERIALIZABLE"]) {
      expect(() => run(`BEGIN ISOLATION LEVEL ${isolation}; SELECT count(*) FROM cohort_enrollments;
        SELECT id FROM publish_academic_assignment('${assignment}','${actor}'); COMMIT;`)).toThrow();
      // 함수 대신 직접 상태 변경을 시도해도 동일한 격리 수준 계약을 강제한다.
      expect(() => run(`BEGIN ISOLATION LEVEL ${isolation};
        UPDATE assignments SET status='PUBLISHED',published_by_user_id='${actor}'; COMMIT;`)).toThrow();
      expect(run("SELECT status FROM assignments;")).toBe("DRAFT");
      expect(run("SELECT count(*) FROM assignment_targets;")).toBe("0");
    }
    publish();
    expect(run("SELECT count(*) FROM assignment_targets;")).toBe("1");
  });

  it("대상 저장 실패는 공개 상태·주체까지 원자적으로 롤백한다", () => {
    draft();
    run("ALTER TABLE assignment_targets ADD CONSTRAINT injected_failure CHECK (false);");
    try {
      expect(publish).toThrow();
      expect(run("SELECT status||':'||(published_at IS NULL)::text||':'||(published_by_user_id IS NULL)::text FROM assignments;")).toBe("DRAFT:true:true");
      expect(run("SELECT count(*) FROM assignment_targets;")).toBe("0");
    } finally { run("ALTER TABLE assignment_targets DROP CONSTRAINT injected_failure;"); }
    publish();
    expect(run("SELECT count(*) FROM assignment_targets;")).toBe("1");
  });

  it("동시 공개 재시도는 최초 공개 시각·주체와 대상 한 건을 재사용한다", async () => {
    draft();
    const first = spawn(program("psql"),args,{stdio:["pipe","pipe","pipe"]});
    const second = spawn(program("psql"),args,{stdio:["pipe","pipe","pipe"]});
    const done = [first,second].map(child=>new Promise<number|null>((resolve,reject)=>{child.on("error",reject);child.on("close",resolve);}));
    const waitFor = async (sql:string) => {
      for(let attempt=0;attempt<100;attempt++) { if(run(sql)==="1") return; await delay(20); }
      throw new Error("동시 공개 잠금 상태를 확인하지 못했습니다.");
    };
    try {
      first.stdin.write(`SET application_name='academic_publish_first'; BEGIN; SELECT id FROM publish_academic_assignment('${assignment}','${actor}');\n`);
      await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='academic_publish_first' AND state='idle in transaction';");
      second.stdin.end(`SET application_name='academic_publish_second'; SELECT id FROM publish_academic_assignment('${assignment}','${actor}');`);
      await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='academic_publish_second' AND wait_event_type='Lock';");
      first.stdin.end("COMMIT;\n");
      expect(await done[0]).toBe(0); expect(await done[1]).toBe(0);
      expect(run("SELECT count(*) FROM assignment_targets;")).toBe("1");
      const snapshot=run("SELECT row_to_json(a) FROM assignments a;");
      publish(); expect(run("SELECT row_to_json(a) FROM assignments a;")).toBe(snapshot);
    } finally {
      for(const child of [first,second]) { if(!child.stdin.writableEnded) child.stdin.end("ROLLBACK;\n"); if(child.exitCode===null) child.kill(); }
      await Promise.all(done);
    }
  },15000);

  it.each([
    ["수업 기수", `UPDATE schedule_events SET cohort_id='${otherCohort}' WHERE id='${event}';`],
    ["세션 수업", `UPDATE schedule_sessions SET schedule_event_id='50000000-0000-4000-8000-000000000002' WHERE id='${session}';`],
    ["학적 기수", `UPDATE cohort_enrollments SET cohort_id='${otherCohort}' WHERE id='${enrollment}';`],
  ])("이전 REPEATABLE READ 스냅샷 뒤 과제가 공개되어도 %s 이동을 거부한다", async (_label, update) => {
    run(`INSERT INTO schedule_events (id,cohort_id) VALUES
      ('50000000-0000-4000-8000-000000000002','${otherCohort}') ON CONFLICT (id) DO NOTHING;`);
    const old = spawn(program("psql"), args, {stdio:["pipe","pipe","pipe"]});
    let stderr = "";
    old.stderr.on("data", chunk => {stderr += String(chunk);});
    const done = new Promise<number|null>((resolve,reject)=>{old.on("error",reject);old.on("close",resolve);});
    try {
      // 기존 연결은 아직 과제가 존재하지 않는 스냅샷을 고정한다.
      old.stdin.write("SET application_name='academic_reference_old'; BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT count(*) FROM assignments;\n");
      let ready = false;
      for (let attempt=0; attempt<100; attempt++) {
        if (run("SELECT count(*) FROM pg_stat_activity WHERE application_name='academic_reference_old' AND state='idle in transaction';") === "1") {ready=true;break;}
        await delay(20);
      }
      expect(ready).toBe(true);
      // 별도 READ COMMITTED 연결에서 과제·대상 확정을 커밋한다.
      draft(`,'${event}','${session}'`);
      publish();
      old.stdin.end(`${update} COMMIT;\n`);
      expect(await done).toBe(3);
      expect(stderr).toContain("READ COMMITTED");
      expect(run(`SELECT cohort_id FROM schedule_events WHERE id='${event}';`)).toBe(cohort);
      expect(run(`SELECT schedule_event_id FROM schedule_sessions WHERE id='${session}';`)).toBe(event);
      expect(run(`SELECT cohort_id FROM cohort_enrollments WHERE id='${enrollment}';`)).toBe(cohort);
      expect(run("SELECT count(*) FROM assignment_targets;")).toBe("1");
    } finally {
      if (!old.stdin.writableEnded) old.stdin.end("ROLLBACK;\n");
      if (old.exitCode === null) old.kill();
      await done;
    }
  }, 15000);

  it("기본값·CHECK·FK·인덱스가 달라진 migration 재실행은 데이터 손실 없이 거부한다", () => {
    draft(); publish();
    const snapshot=run("SELECT row_to_json(a) FROM assignments a;");
    const cases=[
      ["ALTER TABLE assignments ALTER COLUMN instructions DROP DEFAULT;",
        "ALTER TABLE assignments ALTER COLUMN instructions SET DEFAULT '';"],
      ["ALTER TABLE assignments DROP CONSTRAINT assignments_title_not_blank; ALTER TABLE assignments ADD CONSTRAINT assignments_title_not_blank CHECK (length(title)>0);",
        "ALTER TABLE assignments DROP CONSTRAINT assignments_title_not_blank; ALTER TABLE assignments ADD CONSTRAINT assignments_title_not_blank CHECK (length(btrim(title))>0);"],
      ["DROP INDEX assignment_targets_enrollment_idx; CREATE INDEX assignment_targets_enrollment_idx ON assignment_targets (assigned_at);",
        "DROP INDEX assignment_targets_enrollment_idx; CREATE INDEX assignment_targets_enrollment_idx ON assignment_targets (enrollment_id);"],
      ["ALTER TABLE assignment_targets DROP CONSTRAINT assignment_targets_assignment_id_assignments_id_fk; ALTER TABLE assignment_targets ADD CONSTRAINT assignment_targets_assignment_id_assignments_id_fk FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE;",
        "ALTER TABLE assignment_targets DROP CONSTRAINT assignment_targets_assignment_id_assignments_id_fk; ALTER TABLE assignment_targets ADD CONSTRAINT assignment_targets_assignment_id_assignments_id_fk FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE RESTRICT;"],
    ];
    for(const [damage,repair] of cases) {
      run(damage);
      try {expect(()=>run(migration)).toThrow();expect(run("SELECT row_to_json(a) FROM assignments a;")).toBe(snapshot);}
      finally {run(repair);}
      run(migration);
    }
    expect(run("SELECT count(*) FROM assignment_targets;")).toBe("1");
  });

  it("기존 정의 불일치는 신규 테이블 생성까지 롤백하며 기존 데이터를 보존한다", () => {
    run("DROP FUNCTION publish_academic_assignment(uuid,uuid); DROP TABLE assignment_targets,assignments; CREATE TABLE assignments (id uuid PRIMARY KEY);");
    try {
      expect(()=>run(migration)).toThrow();
      expect(run("SELECT to_regclass('public.assignment_targets') IS NULL;")).toBe("t");
      expect(run("SELECT count(*) FROM information_schema.columns WHERE table_name='assignments';")).toBe("1");
      expect(run("SELECT count(*) FROM cohort_enrollments;")).toBe("1");
    } finally {run("DROP TABLE assignments;");run(migration);}
  });
});
