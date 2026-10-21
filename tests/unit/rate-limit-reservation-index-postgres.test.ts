// @vitest-environment node
/**
 * #287 변경 SQL을 격리 PostgreSQL에서 검증합니다.
 * 기존 #121 설치·행·함수를 보존하고 재실행/잘못된 정의/중복 커버를 구분합니다.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { rateLimitEvents } from "@/lib/db/schema";

const bin=process.env.HRA_TEST_PG_BIN;
const migration=readFileSync("scripts/migrate-287-rate-limit-reservation-index.sql","utf8");
const previous=readFileSync("scripts/sql/rate-limit-reservations.sql","utf8");
const name="idx_rate_limit_reservation_id";

describe.skipIf(!bin)("예약 ID 인덱스 변경 PostgreSQL 검증",()=>{
 let root:string,started=false,psqlArgs:string[];
 const program=(name:string)=>join(bin!,name);
 const run=(statement:string)=>execFileSync(program("psql"),psqlArgs,{input:statement,encoding:"utf8",stdio:["pipe","pipe","pipe"]}).trim();
 const definition=()=>run(`SELECT pg_get_indexdef('public.${name}'::regclass);`);
 const functionDefinition=()=>run("SELECT pg_get_functiondef('reserve_rate_limit(text[],text[],integer[],integer[])'::regprocedure);");
 beforeAll(()=>{
  root=mkdtempSync(join(tmpdir(),"hra-reservation-index-"));
  execFileSync(program("initdb"),["-D",join(root,"data"),"-A","trust","-U","hra_test","--no-locale","-E","UTF8"],{stdio:"pipe"});
  execFileSync(program("pg_ctl"),["-D",join(root,"data"),"-l",join(root,"server.log"),"-o",`-h '' -k ${root} -p 55472`,"-w","start"],{stdio:"pipe"});started=true;
  psqlArgs=["-X","-h",root,"-p","55472","-U","hra_test","-d","postgres","-v","ON_ERROR_STOP=1","-Atq"];
  run("CREATE TABLE application_submissions(id uuid PRIMARY KEY);");
 },30000);
 beforeEach(()=>{
  run("DROP TABLE IF EXISTS rate_limit_events; DROP TABLE IF EXISTS unrelated_index_fixture;");
  run(previous);
 });
 afterAll(()=>{
  try{if(started)execFileSync(program("pg_ctl"),["-D",join(root,"data"),"-m","immediate","-w","stop"],{stdio:"pipe"});}
  finally{if(root)rmSync(root,{recursive:true,force:true});}
 });

 it("빈 기본 스키마에 추가하며 Drizzle의 기존 세 인덱스와 새 단일 열 정의를 보존한다",()=>{
  run(migration);
  const indexes=JSON.parse(run("SELECT json_agg(indexname ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='rate_limit_events' AND indexname<>'rate_limit_events_pkey';"));
  expect(indexes).toEqual(getTableConfig(rateLimitEvents).indexes.map(index=>index.config.name).sort());
  expect(definition()).toBe(`CREATE INDEX ${name} ON public.rate_limit_events USING btree (reservation_id)`);
 });

 it("기존 데이터와 예약 함수는 바꾸지 않고 재실행해도 같은 인덱스 OID를 유지한다",()=>{
  const reservation=run("SELECT reservation_id FROM reserve_rate_limit(ARRAY['login-ip','login-pair'],ARRAY[repeat('a',64),repeat('b',64)],ARRAY[5,5],ARRAY[60,60]);");
  const rows=run("SELECT json_agg(e ORDER BY scope) FROM rate_limit_events e;");
  const functionBefore=functionDefinition();
  run(migration);
  const oid=run(`SELECT '${name}'::regclass::oid;`);
  run(migration);
  expect(run(`SELECT '${name}'::regclass::oid;`)).toBe(oid);
  expect(run("SELECT json_agg(e ORDER BY scope) FROM rate_limit_events e;")).toBe(rows);
  expect(functionDefinition()).toBe(functionBefore);
  run(`DELETE FROM rate_limit_events WHERE reservation_id='${reservation}'::uuid;`);
  expect(run("SELECT count(*) FROM rate_limit_events;")).toBe("0");
 });

 it.each([
  "(attempted_at)",
  "(reservation_id,attempted_at)",
  "(reservation_id DESC)",
  "(reservation_id) WHERE scope='login-ip'",
  "((reservation_id::text))",
  "(reservation_id) INCLUDE(scope)",
 ])("같은 이름의 예상 밖 정의 %s는 변경 없이 중단한다",columns=>{
  run(`CREATE INDEX ${name} ON rate_limit_events ${columns};`);
  const before=definition();
  expect(()=>run(migration)).toThrow(/reservation_index_definition_mismatch/);
  expect(definition()).toBe(before);
 });

 it("같은 이름이 다른 테이블에 있어도 자동 삭제·이름 변경을 하지 않는다",()=>{
  run(`CREATE TABLE unrelated_index_fixture(id uuid); CREATE INDEX ${name} ON unrelated_index_fixture(id);`);
  const before=definition();
  expect(()=>run(migration)).toThrow(/reservation_index_definition_mismatch/);
  expect(definition()).toBe(before);
 });

 it.each(["indisvalid","indisready"])("같은 이름의 %s=false 상태는 복구를 추측하지 않고 중단한다",flag=>{
  run(migration);
  // 실제 pg_index 상태를 격리 DB에서만 주입해 실패한 인덱스의 사후 검사 경계를 확인합니다.
  run(`UPDATE pg_index SET ${flag}=false WHERE indexrelid='${name}'::regclass;`);
  expect(()=>run(migration)).toThrow(/reservation_index_definition_mismatch/);
  expect(run(`SELECT ${flag} FROM pg_index WHERE indexrelid='${name}'::regclass;`)).toBe("f");
 });

 it.each(["(reservation_id)","(reservation_id,attempted_at)","(reservation_id,lower(scope))"])("다른 이름의 유효한 선두 인덱스 %s는 중복 생성 없이 검토를 요청한다",columns=>{
  run(`CREATE INDEX existing_reservation_lookup ON rate_limit_events ${columns};`);
  const oid=run("SELECT 'existing_reservation_lookup'::regclass::oid;");
  expect(()=>run(migration)).toThrow(/reservation_index_existing_coverage_review/);
  expect(run(`SELECT to_regclass('public.${name}') IS NULL;`)).toBe("t");
  expect(run("SELECT 'existing_reservation_lookup'::regclass::oid;")).toBe(oid);
 });

 it.each(["(reservation_id) WHERE scope='login-ip'","((reservation_id::text))"])("다른 이름의 부분·표현식 %s는 전체 커버로 오인하지 않는다",columns=>{
  run(`CREATE INDEX existing_partial_lookup ON rate_limit_events ${columns};`);
  run(migration);
  expect(definition()).toContain("USING btree (reservation_id)");
  expect(run("SELECT to_regclass('public.existing_partial_lookup') IS NOT NULL;")).toBe("t");
 });

 it("다른 이름의 무효 인덱스는 전체 커버로 오인하거나 자동 복구하지 않는다",()=>{
  run("CREATE INDEX existing_invalid_lookup ON rate_limit_events(reservation_id); UPDATE pg_index SET indisvalid=false WHERE indexrelid='existing_invalid_lookup'::regclass;");
  run(migration);
  expect(definition()).toContain("USING btree (reservation_id)");
  expect(run("SELECT indisvalid FROM pg_index WHERE indexrelid='existing_invalid_lookup'::regclass;")).toBe("f");
 });

 it.each([
  `CREATE UNIQUE INDEX ${name} ON rate_limit_events(reservation_id);`,
  `CREATE INDEX ${name} ON rate_limit_events USING hash(reservation_id);`,
 ])("같은 이름의 유일성·방식 변경도 거부한다: %s",statement=>{
  run(statement);const before=definition();
  expect(()=>run(migration)).toThrow(/reservation_index_definition_mismatch/);
  expect(definition()).toBe(before);
 });

 it("예약 열의 예상 타입이 다르면 인덱스를 생성하기 전에 중단한다",()=>{
  run("ALTER TABLE rate_limit_events ALTER COLUMN reservation_id TYPE text USING reservation_id::text;");
  expect(()=>run(migration)).toThrow(/reservation_index_column_mismatch/);
  expect(run(`SELECT to_regclass('public.${name}') IS NULL;`)).toBe("t");
 });

 it("선행 테이블이 없으면 생성하지 않고 명확하게 중단한다",()=>{
  run("DROP TABLE rate_limit_events;");
  expect(()=>run(migration)).toThrow(/reservation_index_table_missing/);
  expect(run("SELECT to_regclass('public.rate_limit_events') IS NULL;")).toBe("t");
 });
});
