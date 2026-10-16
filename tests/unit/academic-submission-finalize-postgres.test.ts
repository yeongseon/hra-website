// @vitest-environment node
/** 실제 격리 PostgreSQL에서 최종화 wrapper의 복구·경합·철회·롤백을 검증합니다. */
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { finalizedSubmissionSchema } from "@/features/academics/submissions/validation";
import { buildStudentAssignmentListQuery } from "@/features/academics/student-assignments/data";

const bin = process.env.HRA_TEST_PG_BIN;
const user = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const cohort = "20000000-0000-4000-8000-000000000001";
const student = "30000000-0000-4000-8000-000000000001";
const assignment = "40000000-0000-4000-8000-000000000001";
const intent = "50000000-0000-4000-8000-000000000001";
const otherIntent = "50000000-0000-4000-8000-000000000002";
const key = "60000000-0000-4000-8000-000000000001";
const otherKey = "60000000-0000-4000-8000-000000000002";

describe.skipIf(!bin)("제출 최종화 wrapper PostgreSQL", () => {
  let root: string; let started = false; let args: string[]; let target: string;
  const program = (name: string) => join(bin!,name);
  const run = (query: string) => execFileSync(program("psql"),args,{ input:query,encoding:"utf8",stdio:["pipe","pipe","pipe"] }).trim();
  const finalize = (requestKey=key, uploadId=intent, commit=true, actor=user) =>
    `SELECT complete_academic_assignment_submission('${target}','${actor}','${uploadId}','${requestKey}',${commit});`;
  const makeIntent = (id=intent, expires="30 minutes") => run(`INSERT INTO assignment_upload_intents
    (id,assignment_target_id,user_id,storage_key,expires_at)
    VALUES('${id}','${target}','${user}','assignments/${id}.pdf',clock_timestamp()+interval '${expires}');`);
  const verify = (id=intent) => run(`SELECT verify_academic_assignment_upload('${id}','${user}','시험과제.pdf','application/pdf',2048,'${"a".repeat(64)}');`);
  const counts = () => run("SELECT jsonb_build_array((SELECT count(*) FROM assignment_submissions), (SELECT count(*) FROM assignment_submission_files), (SELECT count(*) FROM assignment_upload_intents WHERE state='CONSUMED'));");

  beforeAll(() => {
    root=mkdtempSync(join(tmpdir(),"hra-finalize-wrapper-"));
    execFileSync(program("initdb"),["-D",join(root,"data"),"-A","trust","-U","hra_test","--no-locale","-E","UTF8"],{stdio:"pipe"});
    execFileSync(program("pg_ctl"),["-D",join(root,"data"),"-l",join(root,"server.log"),"-o",`-h '' -k ${root} -p 55456`,"-w","start"],{stdio:"pipe"});
    started=true;
    args=["-X","-h",root,"-p","55456","-U","hra_test","-d","postgres","-v","ON_ERROR_STOP=1","-Atq"];
    run(`CREATE TABLE users(id uuid PRIMARY KEY,role text NOT NULL DEFAULT 'MEMBER');
      CREATE TABLE cohorts(id uuid PRIMARY KEY);
      CREATE TABLE schedule_events(id uuid PRIMARY KEY,cohort_id uuid REFERENCES cohorts(id));
      CREATE TABLE schedule_sessions(id uuid PRIMARY KEY,schedule_event_id uuid REFERENCES schedule_events(id));
      INSERT INTO cohorts VALUES('${cohort}'); INSERT INTO users(id) VALUES('${user}'),('${other}');`);
    for (const file of ["scripts/migrate-academic-students.sql","scripts/migrate-academic-assignments.sql",
      "scripts/migrate-academic-submissions.sql","scripts/migrate-academic-upload-authorizations.sql",
      "scripts/migrate-academic-submission-finalization.sql"]) run(readFileSync(file,"utf8"));
    run(readFileSync("scripts/migrate-academic-submission-finalization.sql","utf8"));
  },30000);
  beforeEach(() => {
    run(`TRUNCATE academic_upload_authorizations,assignment_submission_files,assignment_submissions,assignment_upload_intents,assignment_targets,assignments,cohort_enrollments,academic_students;
      UPDATE users SET role='MEMBER';
      INSERT INTO academic_students(id,user_id,display_name) VALUES('${student}','${user}','시험학생');
      INSERT INTO cohort_enrollments(student_id,cohort_id) VALUES('${student}','${cohort}');
      INSERT INTO assignments(id,cohort_id,title,due_at,created_by_user_id)
        VALUES('${assignment}','${cohort}','시험과제',clock_timestamp()+interval '1 hour','${user}');
      SELECT publish_academic_assignment('${assignment}','${user}');`);
    target=run(`SELECT id FROM assignment_targets WHERE assignment_id='${assignment}';`);
  });
  afterAll(() => {
    try { if(started) execFileSync(program("pg_ctl"),["-D",join(root,"data"),"-m","immediate","-w","stop"],{stdio:"pipe"}); }
    finally { if(root) rmSync(root,{recursive:true,force:true}); }
  });

  it("사전 복구 조회는 쓰지 않고 최종 확정은 최소 DTO와 완전한 1건을 반환한다", () => {
    expect(run(finalize(key,intent,false))).toBe("");
    expect(counts()).toBe("[0, 0, 0]");
    makeIntent(); verify();
    const result=finalizedSubmissionSchema.parse(JSON.parse(run(finalize())));
    expect(result.assignmentId).toBe(assignment);
    expect(result.replayed).toBe(false);
    expect(result.file).toMatchObject({mimeType:"application/pdf",sizeBytes:2048});
    expect(counts()).toBe("[1, 1, 1]");
    const text=JSON.stringify(result);
    for(const field of ["storageKey","storage_key","userId","checksum","submissionKey"]) expect(text).not.toContain(field);
    expect(JSON.parse(run(finalize(key,intent,false)))).toMatchObject({submissionId:result.submissionId,submittedAt:result.submittedAt,replayed:true});
    // #150 실제 쿼리는 SQL만 생성하고 실행은 이 격리 DB의 PREPARE에 맡깁니다.
    const query=buildStudentAssignmentListQuery(drizzle(neon("postgresql://fixture@localhost/never-connected")),user,1,20).toSQL();
    const parameters=query.params.map(value=>{
      if(typeof value==="string")return `'${value.replaceAll("'","''")}'`;
      if(typeof value==="number" && Number.isFinite(value))return String(value);
      throw new Error("학생 조회 테스트에 허용하지 않는 인수가 있습니다.");
    });
    const listed=run(`PREPARE student_list AS ${query.sql}; EXECUTE student_list(${parameters.join(",")});`).split("|");
    expect(listed[0]).toBe(assignment);
    expect(listed[6]).toBe(result.submissionId);
    const timestamp=listed[7].replaceAll("'","''");
    expect(run(`SELECT '${timestamp}'::timestamptz=s.submitted_at AND f.id IS NOT NULL
      FROM assignment_targets t LEFT JOIN assignment_submissions s ON s.assignment_target_id=t.id
      LEFT JOIN assignment_submission_files f ON f.submission_id=s.id WHERE t.id='${target}';`)).toBe("t");
  });

  it("마감·만료·종료 뒤 같은 키는 원래 완료 시각을 돌려주고 다른 키·의도는 거부한다", async () => {
    // 이미 공개된 초안을 고치지 않고 짧은 기한의 별도 과제를 생성합니다.
    const secondAssignment="40000000-0000-4000-8000-000000000002";
    run(`INSERT INTO assignments(id,cohort_id,title,due_at,created_by_user_id)
      VALUES('${secondAssignment}','${cohort}','짧은 기한',clock_timestamp()+interval '2 seconds','${user}');
      SELECT publish_academic_assignment('${secondAssignment}','${user}');`);
    target=run(`SELECT id FROM assignment_targets WHERE assignment_id='${secondAssignment}';`);
    makeIntent(intent,"1 second"); verify();
    const result=JSON.parse(run(finalize()));
    await delay(2200);
    run(`UPDATE assignments SET status='CLOSED' WHERE id='${secondAssignment}';`);
    expect(JSON.parse(run(finalize(key,intent,false)))).toMatchObject({submissionId:result.submissionId,submittedAt:result.submittedAt,replayed:true});
    expect(JSON.parse(run(finalize()))).toMatchObject({submissionId:result.submissionId,submittedAt:result.submittedAt,replayed:true});
    expect(() => run(finalize(otherKey))).toThrow();
    expect(() => run(finalize(key,otherIntent))).toThrow();
    expect(counts()).toBe("[1, 1, 1]");
  },15000);

  it("타인·없는 의도·미검증·만료 의도는 최종 제출을 만들지 않는다", async () => {
    expect(() => run(finalize(key,intent,true,other))).toThrow();
    expect(() => run(finalize())).toThrow();
    makeIntent(intent,"200 milliseconds");
    expect(() => run(finalize())).toThrow();
    await delay(250);
    expect(() => run(finalize())).toThrow();
    expect(counts()).toBe("[0, 0, 0]");
  });

  it("파일 저장 실패·커밋 전 중단은 전체 취소되고 같은 키 재시도로 복구된다", () => {
    makeIntent(); verify();
    run("ALTER TABLE assignment_submission_files ADD CONSTRAINT test_failure CHECK (false);");
    try { expect(() => run(finalize())).toThrow(); }
    finally { run("ALTER TABLE assignment_submission_files DROP CONSTRAINT test_failure;"); }
    expect(counts()).toBe("[0, 0, 0]");
    expect(run("SELECT state FROM assignment_upload_intents;")).toBe("VERIFIED");
    run(`BEGIN; ${finalize()}`);
    expect(counts()).toBe("[0, 0, 0]");
    run(finalize());
    expect(counts()).toBe("[1, 1, 1]");
  });

  it.each(["role","ended","future"])("사전 확인 뒤 %s 철회는 새 제출과 성공 복구를 모두 차단한다", operation => {
    makeIntent(); verify();
    const revoke=operation==="role" ? `UPDATE users SET role='PENDING' WHERE id='${user}';`
      : operation==="ended" ? "UPDATE cohort_enrollments SET ended_at=clock_timestamp();"
        : "UPDATE cohort_enrollments SET enrolled_at=clock_timestamp()+interval '1 day';";
    const restore=operation==="role" ? `UPDATE users SET role='MEMBER' WHERE id='${user}';`
      : operation==="ended" ? "UPDATE cohort_enrollments SET ended_at=NULL;"
        : "UPDATE cohort_enrollments SET enrolled_at=created_at;";
    expect(run(finalize(key,intent,false))).toBe("");
    run(revoke);
    expect(() => run(finalize())).toThrow();
    expect(counts()).toBe("[0, 0, 0]");
    run(restore); run(finalize()); run(revoke);
    expect(() => run(finalize(key,intent,false))).toThrow();
    expect(counts()).toBe("[1, 1, 1]");
  });

  it("계정 재연결은 이력 생성 전후 타인 제출로 이어지지 않는다", () => {
    run(`UPDATE academic_students SET user_id='${other}' WHERE id='${student}';`);
    expect(() => run(finalize(key,intent,false))).toThrow();
    run(`UPDATE academic_students SET user_id='${user}' WHERE id='${student}';`);
    makeIntent(); verify();
    expect(() => run(`UPDATE academic_students SET user_id='${other}' WHERE id='${student}';`)).toThrow();
    run(finalize());
    expect(() => run(finalize(key,intent,false,other))).toThrow();
  });

  it("151 실제 발급·검증 뒤 취소된 의도는 원자 최종화에서도 차단한다", () => {
    const issued=run(`SELECT issue_academic_assignment_upload('${key}','${target}','${user}','시험과제.pdf',2048);`);
    run(`SELECT verify_authorized_academic_upload('${issued}','${user}','${"a".repeat(64)}','검증ETag');`);
    expect(run(finalize(key,issued,false))).toBe("");
    run(`SELECT cancel_academic_assignment_upload('${issued}','${user}','${target}');`);
    expect(() => run(finalize(key,issued))).toThrow();
    expect(counts()).toBe("[0, 0, 0]");
  });

  it("다른 키의 동시 최종화는 제출·파일·소비를 하나만 만든다", async () => {
    makeIntent(); verify(); makeIntent(otherIntent); verify(otherIntent);
    const first=spawn(program("psql"),args,{stdio:["pipe","pipe","pipe"]});
    const second=spawn(program("psql"),args,{stdio:["pipe","pipe","pipe"]});
    const done=(child:typeof first)=>new Promise<number|null>((resolve,reject)=>{child.on("close",resolve);child.on("error",reject);});
    const firstDone=done(first); const secondDone=done(second);
    const waitFor=async(query:string)=>{for(let n=0;n<100;n++){if(run(query)==="1")return;await delay(20);}throw new Error("최종화 잠금 상태를 확인하지 못했습니다.");};
    try {
      first.stdin.write(`SET application_name='finalize_wrapper_first'; BEGIN; ${finalize()}\n`);
      await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='finalize_wrapper_first' AND state='idle in transaction';");
      second.stdin.end(`SET application_name='finalize_wrapper_second'; ${finalize(otherKey,otherIntent)}`);
      await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='finalize_wrapper_second' AND wait_event_type='Lock';");
      first.stdin.end("COMMIT;\n");
      expect(await firstDone).toBe(0); expect(await secondDone).toBe(3);
      expect(counts()).toBe("[1, 1, 1]");
    } finally {
      for(const child of[first,second]){if(!child.stdin.writableEnded)child.stdin.end("ROLLBACK;\n");if(child.exitCode===null)child.kill();}
      await Promise.all([firstDone,secondDone]);
    }
  },15000);
});
