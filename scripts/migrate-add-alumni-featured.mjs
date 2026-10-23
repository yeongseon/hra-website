/**
 * 수료생 이야기 메인 노출 컬럼만 추가하는 명시 적용 도구입니다.
 * 무인자는 접속 없는 계획이며, --confirm-apply에도 public의 소유 표 한 컬럼만 다룹니다.
 * 존재하는 정의가 다르면 수정하지 않고 실패하며 기존 행·버전 값을 덮어쓰지 않습니다.
 * 이 확인 인자는 운영 승인·백업·DB 대상 identity의 증명이나 migration ledger가 아닙니다.
 */

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("수료생 이야기 메인 노출 컬럼 계획: public.alumni_stories.is_featured boolean NOT NULL DEFAULT false. 접속·변경 없음. [SCHEMA_INSTALLER_PLAN]");
  process.exit(0);
}
if (args.length !== 1 || args[0] !== "--confirm-apply") {
  console.error("--confirm-apply 한 개만 지정할 수 있습니다. [SCHEMA_INSTALLER_ARGUMENTS]");
  process.exit(1);
}

let connection;
try {
  connection = process.env.DATABASE_URL;
  const target = new URL(connection || "");
  if (!["postgres:", "postgresql:"].includes(target.protocol) || !target.hostname || target.hash ||
    !decodeURIComponent(target.username) || !decodeURIComponent(target.password) ||
    /[\0\r\n]/.test(decodeURIComponent(target.username + target.password)) ||
    !/^[a-zA-Z0-9_.-]{1,63}$/.test(decodeURIComponent(target.pathname.slice(1)))) throw new Error("URL");
  const parameters = [...target.searchParams.keys()];
  if (new Set(parameters).size !== parameters.length || parameters.some(key => !["sslmode", "channel_binding", "application_name"].includes(key))) throw new Error("OPTIONS");
  if (target.searchParams.has("sslmode") && !["disable", "allow", "prefer", "require", "verify-ca", "verify-full"].includes(target.searchParams.get("sslmode")) ||
    target.searchParams.has("channel_binding") && !["disable", "prefer", "require"].includes(target.searchParams.get("channel_binding")) ||
    target.searchParams.has("application_name") && !/^[a-zA-Z0-9_.-]{1,63}$/.test(target.searchParams.get("application_name"))) throw new Error("OPTIONS");
} catch {
  console.error("명시적인 DB URL 자격·대상·옵션을 확인하세요. [SCHEMA_INSTALLER_TARGET_INVALID]");
  process.exit(1);
}

// 단일 DO 문은 한 transaction에서 잠금·선행 소유권·한정 DDL·정확한 후조건을 함께 검사합니다.
// pg_has_role의 superuser 허용을 쓰지 않고 실제 table/schema/database 소유 OID를 직접 비교합니다.
const statement = `DO $schema_installer$
DECLARE
  target_oid pg_catalog.oid;
  caller_oid pg_catalog.oid;
  schema_owned boolean;
BEGIN
  PERFORM pg_catalog.set_config('search_path','pg_catalog,public',true);
  PERFORM pg_catalog.set_config('lock_timeout','5s',true);
  SELECT oid INTO caller_oid FROM pg_catalog.pg_roles WHERE rolname=current_user;
  SELECT c.oid, coalesce(n.nspowner=caller_oid OR
    (n.nspowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='pg_database_owner') AND
     caller_oid=(SELECT datdba FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database())),false)
    INTO target_oid,schema_owned
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='alumni_stories' AND c.relkind='r' AND c.relowner=caller_oid;
  IF target_oid IS NULL OR schema_owned IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'schema_installer_owner_mismatch';
  END IF;
  LOCK TABLE ONLY public.alumni_stories IN ACCESS EXCLUSIVE MODE;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid=target_oid AND attname='is_featured' AND attnum>0 AND NOT attisdropped) THEN
    ALTER TABLE ONLY public.alumni_stories ADD COLUMN is_featured boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE c.oid=target_oid AND n.nspname='public' AND c.relname='alumni_stories' AND c.relkind='r' AND c.relowner=caller_oid
      AND coalesce(n.nspowner=caller_oid OR
        (n.nspowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='pg_database_owner') AND
         caller_oid=(SELECT datdba FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database())),false)
      AND a.attname='is_featured' AND a.attnum>0 AND NOT a.attisdropped
      AND a.atttypid='pg_catalog.bool'::pg_catalog.regtype AND a.atttypmod=-1 AND a.attnotnull
      AND a.attidentity='' AND a.attgenerated='' AND a.attndims=0
      AND pg_catalog.pg_get_expr(d.adbin,d.adrelid,false)='false'
  ) THEN RAISE EXCEPTION 'schema_installer_column_mismatch'; END IF;
END;
$schema_installer$`;

/** 검증한 URL만으로 client를 만들고 원본 오류·자격정보는 출력하지 않습니다. */
async function apply() {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(connection);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try { await sql.query(statement, [], { fetchOptions: { signal: controller.signal } }); }
  finally { clearTimeout(timer); }
  console.log("수료생 이야기 메인 노출 컬럼의 정확한 정의를 확인했습니다. [SCHEMA_INSTALLER_APPLIED]");
}
apply().catch(() => {
  // HTTP 취소는 서버 rollback 확정이 아닙니다. 자동 재실행·다른 drift 복구를 하지 않습니다.
  console.error("설치 조건·정의·실행 결과를 확인하세요. 원문은 기록하지 않습니다. [SCHEMA_INSTALLER_FAILED]");
  process.exitCode = 1;
});
