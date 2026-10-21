// @vitest-environment node
/**
 * 실제 업로드 예산 어댑터를 격리 PostgreSQL 예약 함수에 연결합니다 (#291).
 * 한 복구 시나리오 안에서 이벤트를 지우지 않고 발급·외부 작업 분리와 비용 상한을 검증합니다.
 */
import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/db",()=>({db:{execute:mocks.execute}}));
import { reserveAssignmentUploadAttempt } from "@/features/academics/assignment-uploads/repository";

const bin=process.env.HRA_TEST_PG_BIN;
const execFileAsync=promisify(execFile);
type Phase="intent"|"external";

describe.skipIf(!bin)("과제 업로드 단계별 예산 PostgreSQL 검증",()=>{
 let root:string,started=false,psqlArgs:string[];
 const program=(name:string)=>join(bin!,name);
 const run=(statement:string)=>execFileSync(program("psql"),psqlArgs,{input:statement,encoding:"utf8",stdio:["pipe","pipe","pipe"]}).trim();
 const runAsync=async(statement:string)=>{
  const {stdout}=await execFileAsync(program("psql"),[...psqlArgs,"-c",statement],{encoding:"utf8"});return stdout.trim();
 };
 beforeAll(()=>{
  root=mkdtempSync(join(tmpdir(),"hra-upload-budget-"));
  execFileSync(program("initdb"),["-D",join(root,"data"),"-A","trust","-U","hra_test","--no-locale","-E","UTF8"],{stdio:"pipe"});
  execFileSync(program("pg_ctl"),["-D",join(root,"data"),"-l",join(root,"server.log"),"-o",`-h '' -k ${root} -p 55465`,"-w","start"],{stdio:"pipe"});started=true;
  psqlArgs=["-X","-h",root,"-p","55465","-U","hra_test","-d","postgres","-v","ON_ERROR_STOP=1","-Atq"];
  run("CREATE TABLE application_submissions(id uuid PRIMARY KEY);");
  run(readFileSync("scripts/sql/rate-limit-reservations.sql","utf8"));
  // ORM 바깥의 연결만 교체하며, 어댑터가 생성한 실제 SQL·scope·해시·상한을 실행합니다.
  mocks.execute.mockImplementation(async(query:SQL)=>{
   const converted=new PgDialect().sqlToQuery(query);
   const statement=converted.sql.replace(/\$(\d+)/g,(_match,index:string)=>{
    const value:unknown=converted.params[Number(index)-1];
    if(typeof value!=="string")throw new Error("예상하지 못한 테스트 SQL 매개변수");
    return `'${value.replaceAll("'","''")}'`;
   });
   const row=await runAsync(`SELECT row_to_json(result) FROM (${statement}) result;`);
   return {rows:[JSON.parse(row)]};
  });
 },30000);
 afterAll(()=>{
  try{if(started)execFileSync(program("pg_ctl"),["-D",join(root,"data"),"-m","immediate","-w","stop"],{stdio:"pipe"});}
  finally{if(root)rmSync(root,{recursive:true,force:true});}
 });

 it.each([
  ["정상 제출",["intent","external","external"]],
  ["PUT 실패 후 취소·새 의도",["intent","external","intent","external","external"]],
  ["검증 실패 후 같은 의도 재시도",["intent","external","external","external"]],
  ["검증 실패 후 취소·교체",["intent","external","external","intent","external","external"]],
 ] as const)("%s의 단계가 같은 창에서 모두 허용된다",async(_name,phases)=>{
  const user=randomUUID(),target=randomUUID();
  for(const phase of phases)await reserveAssignmentUploadAttempt(user,target,phase);
 });

 it("발급 한도를 소모해도 토큰·검증 예산은 남고, 실패 외부 요청의 다섯 번째는 차단한다",async()=>{
  const user=randomUUID(),target=randomUUID();
  for(let index=0;index<4;index++)await reserveAssignmentUploadAttempt(user,target,"intent");
  await expect(reserveAssignmentUploadAttempt(user,target,"intent")).rejects.toMatchObject({code:"RATE_LIMITED",retryAfterSeconds:expect.any(Number)});
  for(let index=0;index<4;index++)await reserveAssignmentUploadAttempt(user,target,"external");
  await expect(reserveAssignmentUploadAttempt(user,target,"external")).rejects.toMatchObject({code:"RATE_LIMITED",status:429,retryAfterSeconds:expect.any(Number)});
 });

 it.each(["intent","external"] as const)("%s의 서로 다른 대상도 사용자 여섯 번째까지만 허용한다",async(phase:Phase)=>{
  const user=randomUUID();
  for(let index=0;index<6;index++)await reserveAssignmentUploadAttempt(user,randomUUID(),phase);
  await expect(reserveAssignmentUploadAttempt(user,randomUUID(),phase)).rejects.toMatchObject({code:"RATE_LIMITED"});
 });

 it("동시 외부 요청 열두 개도 대상 네 개까지만 원자 예약한다",async()=>{
  const user=randomUUID(),target=randomUUID();
  const results=await Promise.allSettled(Array.from({length:12},()=>reserveAssignmentUploadAttempt(user,target,"external")));
  expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(4);
  for(const result of results)if(result.status==="rejected")expect(result.reason).toMatchObject({code:"RATE_LIMITED"});
 });

 it("실제 예약 함수 장애는 대기 시간 없는 503으로 차단한다",async()=>{
  run("ALTER FUNCTION reserve_rate_limit(text[],text[],integer[],integer[]) RENAME TO qa_unavailable_rate_limit;");
  try{
   for(const phase of ["intent","external"] as const){
    const failure=await reserveAssignmentUploadAttempt(randomUUID(),randomUUID(),phase).catch((error:unknown)=>error);
    expect(failure).toMatchObject({code:"UNAVAILABLE",status:503});
    expect(failure).not.toHaveProperty("retryAfterSeconds");
   }
  }finally{run("ALTER FUNCTION qa_unavailable_rate_limit(text[],text[],integer[],integer[]) RENAME TO reserve_rate_limit;");}
 });
});
