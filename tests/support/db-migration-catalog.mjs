/**
 * 소유 로컬 migration 테스트의 고정 public/hra_migrations 카탈로그를 관측한다.
 * 연결 생성·환경 파일·운영 승인·SQL 적용은 담당하지 않는다. 원문 정의와 ACL은
 * 함수 내부 메모리에만 두며 호출자에게는 지문과 개수만 반환한다.
 * extension/range 연산자 등 전체 운영 객체의 완전한 비교기는 아니다.
 * pg_get_*def 결과를 비교하므로 호출자는 expected/actual의 search_path를 고정해야 한다.
 */
import { createHash } from "node:crypto";

// OID를 반환하지 않고 역할 이름과 grant option을 읽는다. NULL ACL은 별도 보존한다.
const acl = expression => `CASE WHEN ${expression} IS NULL THEN NULL ELSE
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'grantor', pg_catalog.pg_get_userbyid(a.grantor),
    'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
    'privilege', a.privilege_type, 'grantable', a.is_grantable))
    FROM pg_catalog.aclexplode(${expression}) a), '[]'::jsonb) END`;

// 범위와 식별자는 고정이다. 임시 helper, 시스템 객체, 대상 식별용 schema는 포함하지 않는다.
const scope = "n.nspname IN ('public', 'hra_migrations')";
const queries = {
  schemas: `/* hra-catalog:schemas */ SELECT n.nspname AS schema,
    pg_catalog.pg_get_userbyid(n.nspowner) AS owner, ${acl("n.nspacl")} AS acl
    FROM pg_catalog.pg_namespace n WHERE ${scope}`,
  tables: `/* hra-catalog:tables */ SELECT n.nspname AS schema, c.relname AS name,
    c.relkind AS kind, c.relpersistence AS persistence,
    pg_catalog.pg_get_userbyid(c.relowner) AS owner, ${acl("c.relacl")} AS acl,
    c.relrowsecurity AS row_security, c.relforcerowsecurity AS force_row_security
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE ${scope} AND c.relkind IN ('r','p','v','m','S','f')`,
  columns: `/* hra-catalog:columns */ SELECT n.nspname AS schema, c.relname AS relation,
    a.attname AS name, a.attnum AS position, tn.nspname AS type_schema,
    t.typname AS type_name, a.atttypmod AS type_modifier, a.attndims AS dimensions,
    a.attnotnull AS not_null, a.attidentity AS identity, a.attgenerated AS generated,
    pg_catalog.pg_get_expr(d.adbin,d.adrelid,false) AS default_expression,
    cn.nspname AS collation_schema, col.collname AS collation_name,
    ${acl("a.attacl")} AS acl
    FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_type t ON t.oid=a.atttypid
    JOIN pg_catalog.pg_namespace tn ON tn.oid=t.typnamespace
    LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    LEFT JOIN pg_catalog.pg_collation col ON col.oid=a.attcollation
    LEFT JOIN pg_catalog.pg_namespace cn ON cn.oid=col.collnamespace
    WHERE ${scope} AND a.attnum>0 AND NOT a.attisdropped
    AND c.relkind IN ('r','p','v','m','f')`,
  types: `/* hra-catalog:types */ SELECT n.nspname AS schema, t.typname AS name,
    t.typtype AS kind, pg_catalog.pg_get_userbyid(t.typowner) AS owner,
    ${acl("t.typacl")} AS acl, t.typnotnull AS not_null,
    bn.nspname AS base_schema, bt.typname AS base_name, t.typtypmod AS type_modifier,
    t.typdefault AS default_expression,
    ARRAY(SELECT e.enumlabel FROM pg_catalog.pg_enum e WHERE e.enumtypid=t.oid ORDER BY e.enumsortorder) AS enum_labels
    FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
    LEFT JOIN pg_catalog.pg_type bt ON bt.oid=t.typbasetype
    LEFT JOIN pg_catalog.pg_namespace bn ON bn.oid=bt.typnamespace
    WHERE ${scope}`,
  functions: `/* hra-catalog:functions */ SELECT n.nspname AS schema, p.proname AS name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS signature,
    pg_catalog.pg_get_functiondef(p.oid) AS definition,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner, ${acl("p.proacl")} AS acl,
    p.prosecdef AS security_definer, p.proconfig AS config
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE ${scope} AND p.prokind IN ('f','p')`,
  constraints: `/* hra-catalog:constraints */ SELECT n.nspname AS schema, COALESCE(c.relname,t.typname) AS relation,
    k.conname AS name, k.contype AS kind,
    pg_catalog.pg_get_constraintdef(k.oid,false) AS definition,
    k.confupdtype AS update_action, k.confdeltype AS delete_action,
    k.confmatchtype AS match_type, k.condeferrable AS deferrable,
    k.condeferred AS initially_deferred, k.convalidated AS validated
    FROM pg_catalog.pg_constraint k LEFT JOIN pg_catalog.pg_class c ON c.oid=k.conrelid
    LEFT JOIN pg_catalog.pg_type t ON t.oid=k.contypid
    JOIN pg_catalog.pg_namespace n ON n.oid=k.connamespace WHERE ${scope}`,
  indexes: `/* hra-catalog:indexes */ SELECT n.nspname AS schema, c.relname AS relation,
    ic.relname AS name, pg_catalog.pg_get_indexdef(i.indexrelid,0,false) AS definition,
    i.indisvalid AS valid, i.indisready AS ready, i.indislive AS live,
    i.indisunique AS unique, i.indisprimary AS primary, i.indisreplident AS replica_identity
    FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indrelid
    JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE ${scope}`,
  views: `/* hra-catalog:views */ SELECT n.nspname AS schema, c.relname AS name,
    pg_catalog.pg_get_viewdef(c.oid,false) AS definition, c.reloptions AS options,
    c.relispopulated AS populated
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE ${scope} AND c.relkind IN ('v','m')`,
  triggers: `/* hra-catalog:triggers */ SELECT n.nspname AS schema, c.relname AS relation,
    CASE WHEN t.tgisinternal THEN NULL ELSE t.tgname END AS name,
    CASE WHEN t.tgisinternal THEN NULL ELSE pg_catalog.pg_get_triggerdef(t.oid,false) END AS definition,
    t.tgenabled AS enabled, t.tgisinternal AS internal,
    t.tgdeferrable AS deferrable, t.tginitdeferred AS initially_deferred,
    fn.nspname AS function_schema, f.proname AS function_name,
    pg_catalog.pg_get_function_identity_arguments(f.oid) AS function_signature,
    t.tgtype AS type, pg_catalog.encode(t.tgargs,'hex') AS arguments,
    t.tgattr::text AS columns, kn.nspname AS constraint_schema, k.conname AS constraint_name,
    rn.nspname AS referenced_schema, rc.relname AS referenced_relation
    FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_proc f ON f.oid=t.tgfoid
    JOIN pg_catalog.pg_namespace fn ON fn.oid=f.pronamespace
    LEFT JOIN pg_catalog.pg_constraint k ON k.oid=t.tgconstraint
    LEFT JOIN pg_catalog.pg_namespace kn ON kn.oid=k.connamespace
    LEFT JOIN pg_catalog.pg_class rc ON rc.oid=t.tgconstrrelid
    LEFT JOIN pg_catalog.pg_namespace rn ON rn.oid=rc.relnamespace WHERE ${scope}`,
  policies: `/* hra-catalog:policies */ SELECT n.nspname AS schema, c.relname AS relation,
    p.polname AS name, p.polcmd AS command, p.polpermissive AS permissive,
    ARRAY(SELECT CASE WHEN role_id=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(role_id)::text END
      FROM unnest(p.polroles) role_id ORDER BY 1) AS roles,
    pg_catalog.pg_get_expr(p.polqual,p.polrelid,false) AS using_expression,
    pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid,false) AS check_expression
    FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE ${scope}`,
};

// SELECT 결과 중 검토한 의미 필드만 사용한다. 임의 OID/driver 메타데이터는 지문에 넣지 않는다.
const fields = {
  schemas: ["schema", "owner", "acl"],
  tables: ["schema", "name", "kind", "persistence", "owner", "acl", "row_security", "force_row_security"],
  columns: ["schema", "relation", "name", "position", "type_schema", "type_name", "type_modifier", "dimensions", "not_null", "identity", "generated", "default_expression", "collation_schema", "collation_name", "acl"],
  types: ["schema", "name", "kind", "owner", "acl", "not_null", "base_schema", "base_name", "type_modifier", "default_expression", "enum_labels"],
  functions: ["schema", "name", "signature", "definition", "owner", "acl", "security_definer", "config"],
  constraints: ["schema", "relation", "name", "kind", "definition", "update_action", "delete_action", "match_type", "deferrable", "initially_deferred", "validated"],
  indexes: ["schema", "relation", "name", "definition", "valid", "ready", "live", "unique", "primary", "replica_identity"],
  views: ["schema", "name", "definition", "options", "populated"],
  triggers: ["schema", "relation", "name", "definition", "enabled", "internal", "deferrable", "initially_deferred", "function_schema", "function_name", "function_signature", "type", "arguments", "columns", "constraint_schema", "constraint_name", "referenced_schema", "referenced_relation"],
  policies: ["schema", "relation", "name", "command", "permissive", "roles", "using_expression", "check_expression"],
};
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
// locale/ICU 버전에 영향을 받지 않는 JSON 코드 단위 순서를 고정한다.
const sorted = values => values.toSorted((a, b) => {
  const left = JSON.stringify(a); const right = JSON.stringify(b);
  return left < right ? -1 : left > right ? 1 : 0;
});

// 오류 원문에는 SQL·역할·자료가 포함될 수 있으므로 고정 코드만 외부로 전달한다.
function failure(code) { return Object.assign(new Error(code), { code }); }

// 각 관측 query는 같은 pinned client에서 순차 실행한다. backend/lock 보장은 engine 책임이다.
export async function collectLocalCatalog(client) {
  if (!client || typeof client.query !== "function") throw failure("CATALOG_CLIENT_INVALID");
  const canonical = {};
  const counts = {};
  try {
    for (const [category, sql] of Object.entries(queries)) {
      const result = await client.query(sql, []);
      if (!Array.isArray(result?.rows)) throw failure("CATALOG_SHAPE_INVALID");
      canonical[category] = sorted(result.rows.map(row => {
        // 누락 필드를 조용히 null로 바꾸면 부분 관측이 정상 catalog와 같아질 수 있다.
        if (!row || fields[category].some(field => !Object.hasOwn(row, field))) throw failure("CATALOG_SHAPE_INVALID");
        if (!["public", "hra_migrations"].includes(row.schema)) throw failure("CATALOG_SCOPE_INVALID");
        return Object.fromEntries(fields[category].map(field => {
          let value = row[field];
          if (field === "acl" && value !== null) {
            if (!Array.isArray(value)) throw failure("CATALOG_SHAPE_INVALID");
            value = sorted(value.map(grant => {
              const keys = ["grantor", "grantee", "privilege", "grantable"];
              if (!grant || keys.some(key => !Object.hasOwn(grant, key))) throw failure("CATALOG_SHAPE_INVALID");
              return Object.fromEntries(keys.map(key => [key, grant[key]]));
            }));
          }
          if (["config", "options", "roles"].includes(field) && value !== null) {
            if (!Array.isArray(value)) throw failure("CATALOG_SHAPE_INVALID");
            value = sorted(value);
          }
          // 원문 정의를 보관/반환할 필요 없이 동일성 검사에 필요한 지문으로 줄인다.
          if (["definition", "default_expression", "using_expression", "check_expression"].includes(field) && value !== null) value = hash(value);
          return [field, value];
        }));
      }));
      counts[category] = result.rows.length;
    }
    const probe = canonical.tables.find(row => row.schema === "public" && row.name === "hra_migration_probe");
    let probeRows = [];
    if (probe) {
      // 이 합성 불변식은 고정 integer/text 두 열만 허용한다. 다른 사용자 테이블은 읽지 않는다.
      const columns = canonical.columns.filter(row => row.schema === "public" && row.relation === "hra_migration_probe");
      if (probe.kind !== "r" || columns.length !== 2 || !columns.some(row => row.name === "id" && row.type_schema === "pg_catalog" && row.type_name === "int4") || !columns.some(row => row.name === "value" && row.type_schema === "pg_catalog" && row.type_name === "text")) throw failure("CATALOG_PROBE_SHAPE_INVALID");
      const result = await client.query("/* hra-catalog:probe */ SELECT id, value FROM public.hra_migration_probe ORDER BY id NULLS FIRST, value COLLATE pg_catalog.\"C\" NULLS FIRST", []);
      if (!Array.isArray(result?.rows)) throw failure("CATALOG_SHAPE_INVALID");
      probeRows = result.rows.map(row => {
        if (!row || !Object.hasOwn(row, "id") || !Object.hasOwn(row, "value")) throw failure("CATALOG_SHAPE_INVALID");
        return [row.id, row.value];
      });
    }
    counts.probeRows = probeRows.length;
    canonical.probe = { exists: Boolean(probe), count: probeRows.length, digest: hash(sorted(probeRows)) };
    return { digest: hash(canonical), counts };
  } catch (error) {
    // driver가 반환한 원문 오류·cause·stack을 public result에 전파하지 않는다.
    const codes = ["CATALOG_SHAPE_INVALID", "CATALOG_SCOPE_INVALID", "CATALOG_PROBE_SHAPE_INVALID"];
    throw failure(codes.includes(error?.code) ? error.code : "CATALOG_READ_FAILED");
  }
}
