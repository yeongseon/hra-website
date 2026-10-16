// @vitest-environment node
/** #151 발급·검증·최종화/정리 경합을 운영 접속 없는 실제 PostgreSQL에서 검사한다. */
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { getTableConfig } from "drizzle-orm/pg-core";
import { afterAll,beforeAll,beforeEach,describe,expect,it } from "vitest";
import { academicUploadAuthorizations } from "@/lib/db/academic-upload-authorizations";
const bin=process.env.HRA_TEST_PG_BIN;
const actor="10000000-0000-4000-8000-000000000001",other="10000000-0000-4000-8000-000000000002";
const cohort="20000000-0000-4000-8000-000000000001",student="30000000-0000-4000-8000-000000000001",assignment="40000000-0000-4000-8000-000000000001";
const checksum="a".repeat(64);
describe.skipIf(!bin)("과제 업로드 발급 원장 PostgreSQL",()=>{
 let root:string,started=false,args:string[];
 const program=(name:string)=>join(bin!,name);
 const run=(input:string)=>execFileSync(program("psql"),args,{input,encoding:"utf8",stdio:["pipe","pipe","pipe"]}).trim();
 const target=()=>run("SELECT id FROM assignment_targets LIMIT 1;");
 const issue=(request=randomUUID(),name="과제.pdf",size=5)=>run(`SELECT issue_academic_assignment_upload('${request}','${target()}','${actor}','${name}',${size});`);
 const verify=(id:string,hash=checksum)=>run(`SELECT verify_authorized_academic_upload('${id}','${actor}','${hash}','etag-one');`);
 const cancel=(id:string,selectedTarget=target(),userId=actor)=>run(`SELECT cancel_academic_assignment_upload('${id}','${userId}','${selectedTarget}');`);
 const finalize=(id:string)=>run(`SELECT finalize_academic_assignment_submission('${target()}','${actor}','${id}','${randomUUID()}');`);
 const expire=(id:string)=>run(`ALTER TABLE assignment_upload_intents DISABLE TRIGGER academic_upload_intent_guard;
  UPDATE assignment_upload_intents SET created_at=clock_timestamp()-interval '30 minutes',expires_at=clock_timestamp()-interval '6 minutes',
    verified_at=CASE WHEN verified_at IS NULL THEN NULL ELSE clock_timestamp()-interval '10 minutes' END WHERE id='${id}';
  ALTER TABLE assignment_upload_intents ENABLE TRIGGER academic_upload_intent_guard;`);
 beforeAll(()=>{
  root=mkdtempSync(join(tmpdir(),"hra-upload151-"));
  execFileSync(program("initdb"),["-D",join(root,"data"),"-A","trust","-U","hra_test","--no-locale","-E","UTF8"],{stdio:"pipe"});
  execFileSync(program("pg_ctl"),["-D",join(root,"data"),"-l",join(root,"server.log"),"-o",`-h '' -k ${root} -p 55461`,"-w","start"],{stdio:"pipe"});started=true;
  args=["-X","-h",root,"-p","55461","-U","hra_test","-d","postgres","-v","ON_ERROR_STOP=1","-Atq"];
  run(`CREATE TABLE users(id uuid PRIMARY KEY,role text NOT NULL);CREATE TABLE cohorts(id uuid PRIMARY KEY);
   CREATE TABLE schedule_events(id uuid PRIMARY KEY,cohort_id uuid REFERENCES cohorts(id));CREATE TABLE schedule_sessions(id uuid PRIMARY KEY,schedule_event_id uuid REFERENCES schedule_events(id));
   INSERT INTO users VALUES('${actor}','MEMBER'),('${other}','MEMBER');INSERT INTO cohorts VALUES('${cohort}');`);
  for(const path of ["scripts/migrate-academic-students.sql","scripts/migrate-academic-assignments.sql","scripts/migrate-academic-submissions.sql","scripts/migrate-academic-upload-authorizations.sql"])run(readFileSync(path,"utf8"));
  run(readFileSync("scripts/migrate-academic-upload-authorizations.sql","utf8"));
 },30000);
 beforeEach(()=>{
  run(`TRUNCATE academic_upload_authorizations,assignment_submission_files,assignment_submissions,assignment_upload_intents,assignment_targets,assignments,cohort_enrollments,academic_students;
   UPDATE users SET role='MEMBER';INSERT INTO academic_students(id,user_id,display_name)VALUES('${student}','${actor}','시험 학생');
   INSERT INTO cohort_enrollments(student_id,cohort_id)VALUES('${student}','${cohort}');
   INSERT INTO assignments(id,cohort_id,title,due_at,created_by_user_id)VALUES('${assignment}','${cohort}','시험 과제',clock_timestamp()+interval '1 day','${actor}');
   SELECT id FROM publish_academic_assignment('${assignment}','${actor}');`);
 });
 afterAll(()=>{try{if(started)execFileSync(program("pg_ctl"),["-D",join(root,"data"),"-m","immediate","-w","stop"],{stdio:"pipe"});}finally{if(root)rmSync(root,{recursive:true,force:true});}});
 it("신규/재실행 및 Drizzle 컬럼이 일치한다",()=>{
  const config=getTableConfig(academicUploadAuthorizations);
  const actual=JSON.parse(run("SELECT json_agg(json_build_object('name',attname,'type',format_type(atttypid,atttypmod),'required',attnotnull)ORDER BY attnum)FROM pg_attribute WHERE attrelid='academic_upload_authorizations'::regclass AND attnum>0 AND NOT attisdropped;"));
  expect(actual).toEqual(config.columns.map(column=>({name:column.name,type:column.getSQLType().replace(/^varchar\(/,"character varying("),required:column.notNull})));
  expect(run("SELECT count(*) FROM pg_constraint WHERE conrelid='academic_upload_authorizations'::regclass AND contype='f' AND confdeltype='r';")).toBe("3");
 });
 it("같은 요청을 재사용하고 다른 요청의 병렬 업로드를 거부한다",()=>{
  const request=randomUUID(),id=issue(request);expect(issue(request)).toBe(id);
  expect(()=>issue(request,"다른.pdf")).toThrow(/upload_conflict/);expect(()=>issue()).toThrow(/upload_conflict/);
  expect(run(`SELECT storage_key FROM assignment_upload_intents WHERE id='${id}';`)).toBe(`academic-uploads/v1/${id}/document.pdf`);
  expect(run("SELECT count(*) FROM assignment_submissions;")).toBe("0");
 });
 it("파일 검증은 멱등이며 내용 변경·다른 계정·역할 철회·종료를 거부한다",()=>{
  const id=issue();verify(id);verify(id);
  expect(()=>verify(id,"b".repeat(64))).toThrow(/upload_conflict/);
  expect(()=>run(`SELECT authorize_academic_assignment_upload('${id}','${other}');`)).toThrow();
  run(`UPDATE users SET role='PENDING' WHERE id='${actor}';`);expect(()=>verify(id)).toThrow();run(`UPDATE users SET role='MEMBER' WHERE id='${actor}';`);
  run("UPDATE assignments SET status='CLOSED';");expect(()=>verify(id)).toThrow();
  expect(run("SELECT count(*) FROM assignment_submissions;")).toBe("0");
 });
 it("새 SQL과 재실행 뒤 정상 미소비 의도는 본인만 승인하며 같은/다른 기수 학생은 동일하게 숨긴다",()=>{
  const peerStudent=randomUUID(),outsideStudent=randomUUID(),outsideUser=randomUUID(),outsideCohort=randomUUID(),fresh=randomUUID();
  run(`INSERT INTO users VALUES('${outsideUser}','MEMBER');INSERT INTO cohorts VALUES('${outsideCohort}');
   INSERT INTO academic_students(id,user_id,display_name)VALUES('${peerStudent}','${other}','같은 기수 시험'),('${outsideStudent}','${outsideUser}','다른 기수 시험');
   INSERT INTO cohort_enrollments(student_id,cohort_id)VALUES('${peerStudent}','${cohort}'),('${outsideStudent}','${outsideCohort}');
   INSERT INTO assignments(id,cohort_id,title,due_at,created_by_user_id)VALUES('${fresh}','${cohort}','인가 회귀',clock_timestamp()+interval '1 day','${actor}');
   SELECT id FROM publish_academic_assignment('${fresh}','${actor}');`);
  const selected=run(`SELECT t.id FROM assignment_targets t JOIN cohort_enrollments e ON e.id=t.enrollment_id WHERE t.assignment_id='${fresh}' AND e.student_id='${student}';`);
  const id=run(`SELECT issue_academic_assignment_upload('${randomUUID()}','${selected}','${actor}','본인.pdf',5);`);
  const authorized=(intentId:string,userId:string)=>run(`SELECT intent_id FROM authorize_academic_assignment_upload('${intentId}','${userId}');`);
  for(let attempt=0;attempt<2;attempt++){
   expect(authorized(id,actor)).toBe(id);
   for(const user of [other,outsideUser])expect(()=>authorized(id,user)).toThrow(/upload_not_found/);
   expect(()=>authorized(randomUUID(),actor)).toThrow(/upload_not_found/);
   expect(run(`SELECT state FROM assignment_upload_intents WHERE id='${id}';`)).toBe("INTENDED");
   expect(run("SELECT count(*) FROM assignment_submissions;")).toBe("0");
   run(readFileSync("scripts/migrate-academic-upload-authorizations.sql","utf8"));
  }
 });
 it("현재 역할·활성 학적 철회와 과제 마감은 알려진 고정 거부로 분류한다",()=>{
  const id=issue();const authorize=()=>run(`SELECT intent_id FROM authorize_academic_assignment_upload('${id}','${actor}');`);
  run(`UPDATE users SET role='PENDING' WHERE id='${actor}';`);expect(authorize).toThrow(/upload_not_found/);
  run(`UPDATE users SET role='MEMBER' WHERE id='${actor}';UPDATE cohort_enrollments SET ended_at=clock_timestamp();`);
  expect(authorize).toThrow(/upload_not_found/);run("UPDATE cohort_enrollments SET ended_at=NULL;");
  run("UPDATE cohort_enrollments SET created_at=clock_timestamp()+interval '1 minute';");expect(authorize).toThrow(/upload_not_found/);
  run("UPDATE cohort_enrollments SET created_at=clock_timestamp();UPDATE assignments SET status='CLOSED';");
  expect(authorize).toThrow(/upload_expired/);
 });
 it("예상 인가 예외 이외의 P0001은 고정 404로 바꾸지 않고 그대로 전파한다",()=>{
  const id=issue();
  // 실제 공통 검사의 READ COMMITTED 거부는 예상 소유권 거부 목록에 포함하지 않는다.
  expect(()=>run(`BEGIN ISOLATION LEVEL REPEATABLE READ;SELECT intent_id FROM authorize_academic_assignment_upload('${id}','${actor}');`)).toThrow(/READ COMMITTED/);
 });
 it("취소 VERIFIED는 최종화할 수 없고 새 의도만 발급한다",()=>{
  const id=issue();verify(id);run(`SELECT cancel_academic_assignment_upload('${id}','${actor}','${target()}');`);
  expect(()=>finalize(id)).toThrow(/upload_conflict/);const next=issue();expect(next).not.toBe(id);
  expect(run("SELECT count(*) FROM assignment_submissions;")).toBe("0");
 });
 it.each(["INTENDED","VERIFIED","EXPIRED"])("만료된 %s 의도는 종료 후에도 멱등 취소하고 원장을 보존한다",state=>{
  const id=issue();if(state==="VERIFIED")verify(id);expire(id);
  if(state==="EXPIRED")run(`UPDATE assignment_upload_intents SET state='EXPIRED' WHERE id='${id}';`);
  run("UPDATE assignments SET status='CLOSED';");cancel(id);
  const retired=run(`SELECT retired_at FROM academic_upload_authorizations WHERE intent_id='${id}';`);
  expect(retired).not.toBe("");cancel(id);
  expect(run(`SELECT retired_at FROM academic_upload_authorizations WHERE intent_id='${id}';`)).toBe(retired);
  expect(run("SELECT count(*) FROM academic_upload_authorizations;")).toBe("1");
  expect(run("SELECT count(*) FROM assignment_upload_intents;")).toBe("1");
 });
 it("마감이 지난 공개 과제도 취소하며 API 과제 교차 주입과 다른 계정은 숨긴다",()=>{
  const id=issue();
  // 기다림 없이 시간이 지난 공개 과제 fixture를 구성한다. 운영 경로의 불변 제약을 바꾸지 않는다.
  run("ALTER TABLE assignments DISABLE TRIGGER academic_assignment_guard;UPDATE assignments SET due_at=clock_timestamp()-interval '1 second',published_at=clock_timestamp()-interval '1 minute';ALTER TABLE assignments ENABLE TRIGGER academic_assignment_guard;");
  expect(()=>cancel(id,randomUUID())).toThrow(/upload_not_found/);
  expect(()=>cancel(id,target(),other)).toThrow(/upload_not_found/);cancel(id);
 });
 it("이미 취소했어도 현재 역할과 활성 학적이 철회되면 취소 재호출을 거부한다",()=>{
  const id=issue();cancel(id);run(`UPDATE users SET role='PENDING' WHERE id='${actor}';`);
  expect(()=>cancel(id)).toThrow(/현재 학생 회원/);run(`UPDATE users SET role='MEMBER' WHERE id='${actor}';`);
  run("UPDATE cohort_enrollments SET ended_at=clock_timestamp();");expect(()=>cancel(id)).toThrow(/유효한 등록 학적/);
 });
 it("소비되거나 최종 제출/파일로 참조된 의도는 취소하지 않는다",()=>{
  const id=issue();verify(id);finalize(id);expect(()=>cancel(id)).toThrow(/upload_conflict/);
  // 상태 훼손 시에도 실제 제출 참조 검사가 최종물을 지킨다.
  run(`ALTER TABLE assignment_upload_intents DISABLE TRIGGER academic_upload_intent_guard;UPDATE assignment_upload_intents SET state='VERIFIED' WHERE id='${id}';ALTER TABLE assignment_upload_intents ENABLE TRIGGER academic_upload_intent_guard;`);
  expect(()=>cancel(id)).toThrow(/upload_conflict/);
  expect(run("SELECT retired_at IS NULL FROM academic_upload_authorizations;")).toBe("t");
 });
 it.each(["cancel","finalize"])("%s 선점 시 반대 작업은 같은 대상 잠금에서 대기하고 커밋 뒤 거부한다",async first=>{
  const id=issue();verify(id);const selected=target(),key=randomUUID();
  const cancelSql=`SELECT cancel_academic_assignment_upload('${id}','${actor}','${selected}');`;
  const finalSql=`SELECT finalize_academic_assignment_submission('${selected}','${actor}','${id}','${key}');`;
  const winner=first==="cancel"?cancelSql:finalSql,loser=first==="cancel"?finalSql:cancelSql;
  const held=spawn(program("psql"),args,{stdio:["pipe","pipe","pipe"]});
  const done=new Promise<number|null>((resolve,reject)=>{held.on("error",reject);held.on("close",resolve);});
  try{
   held.stdin.write(`SET application_name='upload151_cancel_race';BEGIN;${winner}\n`);
   let ready=false;for(let n=0;n<100;n++){if(run("SELECT count(*) FROM pg_stat_activity WHERE application_name='upload151_cancel_race' AND state='idle in transaction';")==="1"){ready=true;break;}await delay(20);}expect(ready).toBe(true);
   expect(()=>run(`SET lock_timeout='100ms';${loser}`)).toThrow(/lock timeout/);
   held.stdin.end("COMMIT;\n");expect(await done).toBe(0);expect(()=>run(loser)).toThrow(/upload_conflict/);
   expect(run("SELECT count(*) FROM assignment_submissions;")).toBe(first==="cancel"?"0":"1");
  }finally{if(!held.stdin.writableEnded)held.stdin.end("ROLLBACK;\n");if(held.exitCode===null)held.kill();await done;}
 });
 it("최종 제출과 연결 파일은 만료 후에도 정리 대상으로 선점하지 않는다",()=>{
  const id=issue();verify(id);finalize(id);expire(id);
  expect(run(`SELECT claim_academic_upload_cleanup('${id}');`)).toBe("f");
  expect(run("SELECT count(*) FROM assignment_submission_files;")).toBe("1");
 });
 it("만료+유예 전 정리·만료 후 검증을 거부하고 정리 선점은 재시도 가능하다",()=>{
  const id=issue();verify(id);expect(run(`SELECT claim_academic_upload_cleanup('${id}');`)).toBe("f");expire(id);
  expect(()=>verify(id)).toThrow(/upload_expired/);expect(run(`SELECT claim_academic_upload_cleanup('${id}');`)).toBe("t");
  expect(run(`SELECT claim_academic_upload_cleanup('${id}');`)).toBe("t");expect(()=>finalize(id)).toThrow();
 });
 it("새 의도 발급 원장 저장 실패는 의도까지 롤백한다",()=>{
  run("ALTER TABLE academic_upload_authorizations ADD CONSTRAINT injected_failure CHECK(false) NOT VALID;");
  try{expect(()=>issue()).toThrow();expect(run("SELECT count(*) FROM assignment_upload_intents;")).toBe("0");}finally{run("ALTER TABLE academic_upload_authorizations DROP CONSTRAINT injected_failure;");}
 });
 it("활성 대상 인덱스의 복합키 변경도 구조 불일치로 거부한다",()=>{
  run("DROP INDEX academic_upload_authorizations_active_target_idx;CREATE UNIQUE INDEX academic_upload_authorizations_active_target_idx ON academic_upload_authorizations(target_id,user_id) WHERE retired_at IS NULL;");
  try{expect(()=>run(readFileSync("scripts/migrate-academic-upload-authorizations.sql","utf8"))).toThrow(/upload_migration_mismatch/);}
  finally{run("DROP INDEX academic_upload_authorizations_active_target_idx;CREATE UNIQUE INDEX academic_upload_authorizations_active_target_idx ON academic_upload_authorizations(target_id) WHERE retired_at IS NULL;");}
  run(readFileSync("scripts/migrate-academic-upload-authorizations.sql","utf8"));
 });
 it("동일 요청 동시 실행은 한 의도만 반환한다",async()=>{
  const request=randomUUID(),targetId=target();
  const query=`SELECT issue_academic_assignment_upload('${request}','${targetId}','${actor}','시험.pdf',5);`;
  const execute=()=>new Promise<string>((resolve,reject)=>{const child=spawn(program("psql"),args,{stdio:["pipe","pipe","pipe"]});let output="",error="";child.stdout.on("data",chunk=>{output+=String(chunk);});child.stderr.on("data",chunk=>{error+=String(chunk);});child.on("error",reject);child.on("close",code=>code===0?resolve(output.trim()):reject(new Error(error)));child.stdin.end(query);});
  const result=await Promise.all([execute(),execute()]);expect(result[0]).toBe(result[1]);expect(run("SELECT count(*) FROM assignment_upload_intents;")).toBe("1");
 });
 it("정리 선점 뒤 경합하는 최종화는 대기 후 거부한다",async()=>{
  const id=issue();verify(id);expire(id);
  const cleanup=spawn(program("psql"),args,{stdio:["pipe","pipe","pipe"]});
  const done=new Promise<number|null>((resolve,reject)=>{cleanup.on("error",reject);cleanup.on("close",resolve);});
  try{
   cleanup.stdin.write(`SET application_name='upload151_cleanup';BEGIN;SELECT claim_academic_upload_cleanup('${id}');\n`);
   let ready=false;for(let n=0;n<100;n++){if(run("SELECT count(*) FROM pg_stat_activity WHERE application_name='upload151_cleanup' AND state='idle in transaction';")==="1"){ready=true;break;}await delay(20);}expect(ready).toBe(true);
   expect(()=>run(`SET lock_timeout='100ms';SELECT finalize_academic_assignment_submission('${target()}','${actor}','${id}','${randomUUID()}');`)).toThrow();
   cleanup.stdin.end("COMMIT;\n");expect(await done).toBe(0);expect(()=>finalize(id)).toThrow();
  }finally{if(!cleanup.stdin.writableEnded)cleanup.stdin.end("ROLLBACK;\n");if(cleanup.exitCode===null)cleanup.kill();await done;}
 });
});
