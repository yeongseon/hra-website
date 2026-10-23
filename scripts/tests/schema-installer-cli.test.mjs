/** 직접 schema installer CLI를 소유 PostgreSQL·차단된 HTTP 어댑터에서 검증합니다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { createQaPostgres } from '../../tests/support/resource-qa-postgres.mjs';
import { qaSchemaOperatorDatabaseUrl as qaDatabaseUrl, createPsqlTransport, qaDatabaseUrl as bootstrapQaDatabaseUrl } from '../../tests/support/neon-psql-transport.mjs';

const postgresBin = process.env.HRA_TEST_PG_BIN;
if (!postgresBin) throw new Error('SCHEMA_INSTALLER_TEST_PG_REQUIRED');
const repository = fileURLToPath(new URL('../../', import.meta.url));
const targets = [
  { file: 'scripts/migrate-add-alumni-featured.mjs', table: 'alumni_stories', column: 'is_featured', type: 'boolean', value: 'true', defaultValue: 'false' },
  { file: 'scripts/migrate-add-user-session-version.mjs', table: 'users', column: 'session_version', type: 'integer', value: '37', defaultValue: '0' },
];
/** 모든 외부 fetch는 차단하고 기존 검증된 transport로 정확한 합성 URL만 전달합니다. */
function fixture(t, target, { column = '', schemaOwner = 'direct', tableOwner = 'direct', errorResponse = false, decoySchema = false, value = target.value, postDdlFault = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'hra-schema-installer-')); let cluster;
  t.after(() => { try { cluster?.close(); } finally { rmSync(root, { recursive: true, force: true }); } });
  cluster = createQaPostgres(postgresBin);
  // PG16 bootstrap 계정은 강등할 수 없습니다. 관리·관측에만 남기고 실제 CLI는 별도 로그인 역할을 씁니다.
  cluster.sql(`CREATE ROLE hra_schema_operator LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS;
    GRANT CONNECT ON DATABASE hra_resource_qa TO hra_schema_operator;
    CREATE TABLE public.${target.table}(id integer PRIMARY KEY,name text NOT NULL${column ? `,${target.column} ${column}` : ''});
    INSERT INTO public.${target.table}(id,name${column ? `,${target.column}` : ''}) VALUES(1,'합성 보존 행'${column ? `,${column.startsWith('text') ? "'37'" : column.includes('DEFAULT NULL') ? 'NULL' : value}` : ''});
    CREATE ROLE schema_other NOLOGIN;
    ALTER TABLE public.${target.table} OWNER TO hra_schema_operator;
    ${decoySchema ? `CREATE SCHEMA decoy;CREATE TABLE decoy.${target.table}(id integer PRIMARY KEY);ALTER ROLE hra_schema_operator SET search_path=decoy,public;` : ''}
    ${tableOwner === 'other' ? `ALTER TABLE public.${target.table} OWNER TO schema_other;GRANT ALL ON public.${target.table} TO hra_schema_operator;` : ''}
    ${schemaOwner === 'database-owner' || schemaOwner === 'foreign-database-owner' ? 'ALTER SCHEMA public OWNER TO pg_database_owner;' : schemaOwner === 'other' ? 'ALTER SCHEMA public OWNER TO schema_other;' : 'ALTER SCHEMA public OWNER TO hra_schema_operator;'}
    ${schemaOwner === 'database-owner' ? 'ALTER DATABASE hra_resource_qa OWNER TO hra_schema_operator;' : schemaOwner === 'foreign-database-owner' ? 'ALTER DATABASE hra_resource_qa OWNER TO schema_other;' : ''}
    GRANT USAGE ON SCHEMA public TO hra_schema_operator;
    ${postDdlFault ? `CREATE FUNCTION public.invalidate_schema_cli() RETURNS event_trigger LANGUAGE plpgsql AS $fault$
      BEGIN
        IF pg_catalog.current_setting('hra.schema_cli_fault',true)='on' THEN RETURN; END IF;
        PERFORM pg_catalog.set_config('hra.schema_cli_fault','on',true);
        EXECUTE 'ALTER TABLE ONLY public.${target.table} ALTER COLUMN ${target.column} DROP NOT NULL';
      END;$fault$;
      CREATE EVENT TRIGGER schema_cli_fault ON ddl_command_end WHEN TAG IN ('ALTER TABLE') EXECUTE FUNCTION public.invalidate_schema_cli();` : ''}
    `);
  const capture = join(root, 'counts.json'), preload = join(root, 'preload.mjs');
  const transport = pathToFileURL(resolve('tests/support/neon-psql-transport.mjs')).href;
  writeFileSync(preload, `import{writeFileSync}from'node:fs';import{createPsqlTransport,qaSchemaOperatorDatabaseUrl as qaDatabaseUrl,qaNeonEndpoint}from ${JSON.stringify(transport)};
const execute=createPsqlTransport({...process.env,DATABASE_URL:qaDatabaseUrl});const counts={requests:0,blocked:0,errors:0,hasSignal:false};const save=()=>writeFileSync(${JSON.stringify(capture)},JSON.stringify(counts));save();
globalThis.fetch=async(input,options={})=>{counts.requests++;counts.hasSignal=options.signal instanceof AbortSignal;save();const url=input instanceof Request?input.url:String(input),headers=new Headers(options.headers);
if(url!==qaNeonEndpoint||headers.get('Neon-Connection-String')!==qaDatabaseUrl){counts.blocked++;save();throw new Error('SCHEMA_TEST_EXTERNAL_DENIED');}
try{if(${errorResponse})throw new Error('SYNTHETIC_PRIVATE_DB_URL_SQL');const payload=JSON.parse(options.body);if(payload.queries)throw new Error('SCHEMA_TEST_TRANSACTION_UNEXPECTED');return Response.json(await execute(payload));}
catch{counts.errors++;save();return Response.json({message:'SYNTHETIC_PRIVATE_DB_URL_SQL',code:'P0001'},{status:400});}};`);
  const run = (args = [], url = qaDatabaseUrl) => {
    const child = spawnSync(process.execPath, ['--import', preload, target.file, ...args], { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...cluster.environment, DATABASE_URL: url, PGUSER: 'hra_schema_operator', PGPASSWORD: 'test-only' } });
    const counts = existsSync(capture) ? JSON.parse(readFileSync(capture, 'utf8')) : null;
    return { ...child, counts };
  };
  return { cluster, run, columnExists: () => cluster.sql(`SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.${target.table}'::regclass AND attname='${target.column}' AND NOT attisdropped);`) };
}
for (const target of targets) {
  test(`${target.column}: 무인자 직접 CLI는 URL 없이도 계획만 출력하고 접속·DDL 0`, t => {
    const app = fixture(t, target), result = app.run([], '');
    assert.equal(result.status, 0); assert.equal(result.counts.requests, 0); assert.equal(result.counts.blocked, 0); assert.equal(app.columnExists(), 'f');
  });
  test(`${target.column}: URL이 있어도 무인자 직접 CLI는 접속·DDL 0`, t => {
    const app = fixture(t, target), result = app.run();
    assert.equal(result.status, 0); assert.equal(result.counts.requests, 0); assert.equal(app.columnExists(), 'f');
  });
}

function safeOutput(result) {
  for (const marker of ['SYNTHETIC_PRIVATE_DB_URL_SQL', qaDatabaseUrl, 'test-only', 'hra_resource_qa', 'hra_schema_operator', '합성 보존 행']) assert.equal((result.stdout + result.stderr).includes(marker), false);
}
for (const target of targets) {
  test(`${target.column}: unknown·중복 인자는 DB 접속 없이 거부`, t => {
    const app = fixture(t, target);
    for (const args of [['--apply'], ['--confirm-apply', '--confirm-apply'], ['--confirm-apply', '--unknown']]) {
      const result = app.run(args); assert.equal(result.status, 1); assert.equal(result.counts.requests, 0); assert.equal(result.counts.blocked, 0); assert.equal(app.columnExists(), 'f'); safeOutput(result);
    }
  });
  test(`${target.column}: 명시 적용의 잘못된 URL·옵션은 접속 전에 거부`, t => {
    const app = fixture(t, target);
    for (const url of ['', 'not-a-url', 'https://synthetic.invalid/db', 'postgresql://synthetic.invalid/db', 'postgresql://test:@synthetic.invalid/db', 'postgresql://test:test@synthetic.invalid/host%3Dother', `${qaDatabaseUrl}&service=other`, `${qaDatabaseUrl}&sslmode=invalid`, `${qaDatabaseUrl}&channel_binding=invalid`, `${qaDatabaseUrl}&application_name=duplicate`]) {
      const result = app.run(['--confirm-apply'], url); assert.equal(result.status, 1); assert.equal(result.counts.requests, 0); assert.equal(result.counts.blocked, 0); assert.equal(app.columnExists(), 'f'); safeOutput(result);
    }
  });
  test(`${target.column}: 비super 소유 역할의 명시 적용만 한 컬럼을 추가하고 재실행 가능`, t => {
    const app = fixture(t, target, { decoySchema: true });
    assert.equal(app.cluster.sql("SELECT NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolbypassrls FROM pg_catalog.pg_roles WHERE rolname='hra_schema_operator';"), 't');
    assert.equal(app.cluster.sql("SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user;"), 't');
    // 두 고정 URL/로그인 역할 조합만 허용하고 서로 바꾼 계정·외부 URL은 관측 전에 거부합니다.
    const operatorEnvironment = { ...app.cluster.environment, DATABASE_URL: qaDatabaseUrl, PGUSER: 'hra_schema_operator', PGPASSWORD: 'test-only' };
    assert.doesNotThrow(() => createPsqlTransport(app.cluster.environment));
    assert.doesNotThrow(() => createPsqlTransport(operatorEnvironment));
    for (const invalidEnvironment of [
      { ...operatorEnvironment, PGUSER: 'hra_resource_qa' },
      { ...operatorEnvironment, DATABASE_URL: bootstrapQaDatabaseUrl },
      { ...operatorEnvironment, DATABASE_URL: qaDatabaseUrl.replace('resource-qa.invalid', 'other.invalid') },
    ]) assert.throws(() => createPsqlTransport(invalidEnvironment), /격리 PostgreSQL 실행 범위/);

    for (let index = 0; index < 2; index++) {
      const result = app.run(['--confirm-apply']); assert.equal(result.status, 0); assert.equal(result.counts.requests, 1); assert.equal(result.counts.blocked, 0); assert.equal(result.counts.hasSignal, true); assert.equal(app.columnExists(), 't'); safeOutput(result);
    }
    assert.equal(app.cluster.sql(`SELECT pg_catalog.format_type(a.atttypid,a.atttypmod)='${target.type}' AND a.attnotnull AND pg_catalog.pg_get_expr(d.adbin,d.adrelid,false)='${target.defaultValue}' FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.${target.table}'::regclass AND a.attname='${target.column}';`), 't');
    assert.equal(app.cluster.sql(`SELECT count(*) FROM pg_catalog.pg_attribute WHERE attrelid='decoy.${target.table}'::regclass AND attname='${target.column}' AND NOT attisdropped;`), '0');
    assert.equal(app.cluster.sql(`SELECT count(*)=1 AND bool_and(id=1 AND name='합성 보존 행') FROM public.${target.table};`), 't');
  });
  test(`${target.column}: 정확한 기존 컬럼은 값·세션 버전을 그대로 보존`, t => {
    const app = fixture(t, target, { column: `${target.type} NOT NULL DEFAULT ${target.defaultValue}` });
    for (let index = 0; index < 2; index++) { const result = app.run(['--confirm-apply']); assert.equal(result.status, 0); safeOutput(result); }
    assert.equal(app.cluster.sql(`SELECT ${target.column} IS NOT DISTINCT FROM ${target.value} AND name='합성 보존 행' FROM public.${target.table} WHERE id=1;`), 't');
  });
  const badColumns = [
    ['잘못된 타입', target.type === 'boolean' ? 'integer NOT NULL DEFAULT 0' : "text NOT NULL DEFAULT '0'", target.type === 'boolean' ? '1' : "'37'"],
    ['nullable', `${target.type} DEFAULT ${target.defaultValue}`, target.value],
    ['다른 default', `${target.type} NOT NULL DEFAULT ${target.type === 'boolean' ? 'true' : '1'}`, target.value],
    ['default 없음', `${target.type} NOT NULL`, target.value],
    ['배열 타입', `${target.type}[] NOT NULL DEFAULT ARRAY[${target.defaultValue}]`, `ARRAY[${target.value}]`],
    ['계산된 컬럼', `${target.type} NOT NULL GENERATED ALWAYS AS (${target.defaultValue}) STORED`, 'DEFAULT'],
  ];
  for (const [name, column, value] of badColumns) {
    test(`${target.column}: ${name} 정의를 자동 repair하지 않고 거부`, t => {
      const app = fixture(t, target, { column, value });
      const before = app.cluster.sql(`SELECT a.atttypid::text||':'||a.attnotnull::text||':'||coalesce(pg_catalog.pg_get_expr(d.adbin,d.adrelid,false),'no_default') FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.${target.table}'::regclass AND a.attname='${target.column}';`);
      const result = app.run(['--confirm-apply']); assert.equal(result.status, 1); assert.equal(result.counts.requests, 1); assert.equal(result.counts.blocked, 0); safeOutput(result);
      const after = app.cluster.sql(`SELECT a.atttypid::text||':'||a.attnotnull::text||':'||coalesce(pg_catalog.pg_get_expr(d.adbin,d.adrelid,false),'no_default') FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.${target.table}'::regclass AND a.attname='${target.column}';`);
      assert.equal(before === after, true); assert.equal(app.cluster.sql(`SELECT count(*)=1 AND bool_and(id=1 AND name='합성 보존 행') FROM public.${target.table};`), 't');
    });
  }
  test(`${target.column}: 현재 DB owner의 pg_database_owner schema는 허용`, t => {
    const app = fixture(t, target, { schemaOwner: 'database-owner' });
    assert.equal(app.cluster.sql("SELECT pg_catalog.pg_has_role('hra_schema_operator','pg_database_owner','MEMBER') AND (SELECT oid FROM pg_catalog.pg_roles WHERE rolname='hra_schema_operator')=(SELECT datdba FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database());"), 't');
    const result = app.run(['--confirm-apply']); assert.equal(result.status, 0); assert.equal(app.columnExists(), 't'); safeOutput(result);
  });
  for (const schemaOwner of ['other', 'foreign-database-owner']) {
    test(`${target.column}: 다른 schema/DB owner의 권한을 소유자로 간주하지 않음`, t => {
      const app = fixture(t, target, { schemaOwner });
      const result = app.run(['--confirm-apply']); assert.equal(result.status, 1); assert.equal(app.columnExists(), 'f'); assert.equal(result.counts.blocked, 0); safeOutput(result);
    });
  }
  test(`${target.column}: 일반 table grant가 있어도 다른 table owner는 거부`, t => {
    const app = fixture(t, target, { tableOwner: 'other' }); const result = app.run(['--confirm-apply']); assert.equal(result.status, 1); assert.equal(app.columnExists(), 'f'); safeOutput(result);
  });
  test(`${target.column}: DDL 뒤 후조건이 어긋나면 새 컬럼도 한 statement에서 rollback`, t => {
    const app = fixture(t, target, { postDdlFault: true });
    const result = app.run(['--confirm-apply']); assert.equal(result.status, 1); assert.equal(result.counts.requests, 1); assert.equal(app.columnExists(), 'f'); safeOutput(result);
    assert.equal(app.cluster.sql(`SELECT count(*)=1 AND bool_and(id=1 AND name='합성 보존 행') FROM public.${target.table};`), 't');
  });
  test(`${target.column}: DB error의 원본 URL·SQL 표식은 출력하지 않음`, t => {
    const app = fixture(t, target, { errorResponse: true }); const result = app.run(['--confirm-apply']); assert.equal(result.status, 1); assert.equal(result.counts.errors, 1); assert.equal(app.columnExists(), 'f'); safeOutput(result);
  });
}

/** npm 별칭에서도 없는 .env가 기본 계획 실행을 막거나 DB 연결을 유발하지 않습니다. */
for (const target of targets) {
  test(`${target.column}: npm 별칭은 .env 없이도 접속 없는 계획을 실행`, t => {
    const root = mkdtempSync(join(tmpdir(), 'hra-schema-alias-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, 'scripts'));
    copyFileSync(join(repository, target.file), join(root, target.file));
    const alias = target.column === 'is_featured' ? 'db:migrate-alumni-featured' : 'db:migrate-user-session-version';
    const scripts = JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8')).scripts;
    assert.equal(scripts[alias], `node --env-file-if-exists=.env ${target.file}`);
    writeFileSync(join(root, 'package.json'), JSON.stringify({ private: true, scripts: { [alias]: scripts[alias] } }));
    assert.equal(existsSync(join(root, '.env')), false);
    const result = spawnSync('npm', ['run', alias], {
      cwd: root, env: { PATH: process.env.PATH, HOME: root, DATABASE_URL: '' },
      encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024,
    });
    assert.equal(result.status, 0, 'SCHEMA_NPM_PLAN_FAILED');
    assert.equal(result.stdout.includes('[SCHEMA_INSTALLER_PLAN]'), true);
  });
}
