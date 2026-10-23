/**
 * 로컬 catalog 관측의 정규화·의미 변화·원문 비노출 경계를 query mock으로 검증한다.
 * 실제 PostgreSQL 함수/필드 호환과 C[k] 사전 fixture는 별도 integration에서 검증한다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { collectLocalCatalog } from "../../tests/support/db-migration-catalog.mjs";

// 실제 사용자 자료 대신 테스트 전용 표식만 사용하며 실패 시 전체 catalog를 비교하지 않는다.
const sentinel = "catalog-private-sentinel";
const grant = { grantor: "fixture_owner", grantee: "PUBLIC", privilege: "EXECUTE", grantable: false };
const table = name => ({ schema: "public", name, kind: "r", persistence: "p", owner: "fixture_owner", acl: null, row_security: false, force_row_security: false });
const column = (name, type_name, position) => ({ schema: "public", relation: "hra_migration_probe", name, position, type_schema: "pg_catalog", type_name, type_modifier: -1, dimensions: 0, not_null: false, identity: "", generated: "", default_expression: null, collation_schema: null, collation_name: null, acl: null });
function fixture() {
  return {
    schemas: ["public", "hra_migrations"].map(schema => ({ schema, owner: "fixture_owner", acl: null })),
    tables: [table("hra_migration_probe"), { ...table("applied_migrations"), schema: "hra_migrations" }],
    columns: [column("id", "int4", 1), column("value", "text", 2)],
    types: [{ schema: "public", name: "fixture_enum", kind: "e", owner: "fixture_owner", acl: null, not_null: false, base_schema: null, base_name: null, type_modifier: -1, default_expression: null, enum_labels: ["one", "two"] }],
    functions: [{ schema: "public", name: "fixture_function", signature: "integer", definition: `CREATE FUNCTION ${sentinel}`, owner: "fixture_owner", acl: [grant, { ...grant, grantee: "fixture_reader" }], security_definer: false, config: ["search_path=pg_catalog, public", "statement_timeout=1000"] }],
    constraints: [{ schema: "public", relation: "hra_migration_probe", name: "fixture_fk", kind: "f", definition: "FOREIGN KEY (id) REFERENCES fixture_parent(id)", update_action: "a", delete_action: "a", match_type: "s", deferrable: true, initially_deferred: true, validated: true }],
    indexes: [{ schema: "public", relation: "hra_migration_probe", name: "fixture_index", definition: "CREATE INDEX fixture_index ON public.hra_migration_probe(id)", valid: true, ready: true, live: true, unique: false, primary: false, replica_identity: false }],
    views: [{ schema: "public", name: "fixture_view", definition: "SELECT id FROM public.hra_migration_probe", options: ["security_barrier=true", "security_invoker=true"], populated: true }],
    triggers: [{ schema: "public", relation: "hra_migration_probe", name: null, definition: null, enabled: "O", internal: true, deferrable: true, initially_deferred: true, function_schema: "pg_catalog", function_name: "RI_FKey_check_ins", function_signature: "", type: 5, arguments: "", columns: "", constraint_schema: "public", constraint_name: "fixture_fk", referenced_schema: "public", referenced_relation: "fixture_parent" }],
    policies: [{ schema: "public", relation: "hra_migration_probe", name: "fixture_policy", command: "r", permissive: true, roles: ["PUBLIC", "fixture_reader"], using_expression: "id > 0", check_expression: null }],
    probe: [{ id: 1, value: sentinel }, { id: 2, value: "합성 자료" }],
  };
}

// collector가 전달한 SQL의 고정 category 표식만 해석한다. 임의 callback SQL 실행은 없다.
function mock(rows, observe = () => {}) {
  return { async query(sql, values) {
    const category = /\/\* hra-catalog:(\w+) \*\//.exec(sql)?.[1];
    assert.equal(Boolean(category && Object.hasOwn(rows, category)), true, "CATALOG_QUERY_CATEGORY");
    assert.equal(Array.isArray(values) && values.length === 0, true, "CATALOG_BOUND_VALUES");
    observe(sql, category);
    return { rows: structuredClone(rows[category]) };
  } };
}
const digest = async rows => (await collectLocalCatalog(mock(rows))).digest;

test("공개 결과는 digest/counts뿐이고 원문 정의·역할·합성 자료를 노출하지 않는다", async () => {
  const result = await collectLocalCatalog(mock(fixture()));
  assert.equal(Object.keys(result).sort().join(","), "counts,digest");
  assert.match(result.digest, /^[a-f0-9]{64}$/);
  assert.equal(result.counts.probeRows, 2);
  for (const value of [sentinel, "fixture_owner", "CREATE", "합성 자료"]) assert.equal(JSON.stringify(result).includes(value), false, "CATALOG_RESULT_REDACTED");
});

test("row·ACL·config·view option 순서와 OID는 digest를 바꾸지 않는다", async () => {
  const original = fixture();
  const changed = structuredClone(original);
  for (const [category, rows] of Object.entries(changed)) {
    rows.reverse();
    for (const row of rows) {
      row.oid = 99999;
      row.owner_oid = 1234;
      if (Array.isArray(row.acl)) row.acl.reverse();
      if (Array.isArray(row.config)) row.config.reverse();
      if (Array.isArray(row.options)) row.options.reverse();
      if (Array.isArray(row.roles)) row.roles.reverse();
    }
    assert.equal(Array.isArray(changed[category]), true);
  }
  assert.equal(await digest(original), await digest(changed));
});

// 독립 drift마다 hash 변화만 비교하므로 assertion 실패가 raw snapshot을 출력하지 않는다.
for (const [name, change] of [
  ["함수 본문", rows => { rows.functions[0].definition += " changed"; }],
  ["함수 signature", rows => { rows.functions[0].signature = "text"; }],
  ["함수 보안", rows => { rows.functions[0].security_definer = true; }],
  ["함수 search_path", rows => { rows.functions[0].config[0] = "search_path=public"; }],
  ["함수 ACL", rows => { rows.functions[0].acl[0].grantable = true; }],
  ["함수 소유자", rows => { rows.functions[0].owner = "different_owner"; }],
  ["schema ACL NULL/명시 grant", rows => { rows.schemas[0].acl = [grant]; }],
  ["table ACL NULL/empty", rows => { rows.tables[0].acl = []; }],
  ["table 소유자", rows => { rows.tables[0].owner = "different_owner"; }],
  ["열 default", rows => { rows.columns[0].default_expression = "42"; }],
  ["열 identity", rows => { rows.columns[0].identity = "a"; }],
  ["열 순서", rows => { rows.columns[0].position = 3; }],
  ["enum 순서", rows => { rows.types[0].enum_labels.reverse(); }],
  ["FK delete", rows => { rows.constraints[0].delete_action = "c"; }],
  ["FK update", rows => { rows.constraints[0].update_action = "r"; }],
  ["FK deferrable", rows => { rows.constraints[0].deferrable = false; }],
  ["FK deferred", rows => { rows.constraints[0].initially_deferred = false; }],
  ["FK validated", rows => { rows.constraints[0].validated = false; }],
  ["CHECK 정의", rows => { rows.constraints[0].kind = "c"; rows.constraints[0].definition = "CHECK (id > 0)"; }],
  ["index 정의", rows => { rows.indexes[0].definition += " WHERE id > 0"; }],
  ["index validity", rows => { rows.indexes[0].valid = false; }],
  ["view 정의", rows => { rows.views[0].definition += " WHERE id > 0"; }],
  ["내부 FK trigger enabled", rows => { rows.triggers[0].enabled = "D"; }],
  ["내부 FK trigger 함수", rows => { rows.triggers[0].function_name = "RI_FKey_check_upd"; }],
  ["사용자 trigger 정의", rows => { rows.triggers[0].internal = false; rows.triggers[0].name = "fixture_trigger"; rows.triggers[0].definition = "CREATE TRIGGER fixture_trigger"; }],
  ["RLS flag", rows => { rows.tables[0].row_security = true; }],
  ["policy using", rows => { rows.policies[0].using_expression = "id > 1"; }],
  ["policy check", rows => { rows.policies[0].check_expression = "id > 1"; }],
  ["policy role", rows => { rows.policies[0].roles = ["fixture_reader"]; }],
  ["policy permissive", rows => { rows.policies[0].permissive = false; }],
  ["합성 row 값", rows => { rows.probe[0].value += " changed"; }],
  ["합성 row 중복", rows => { rows.probe.push(rows.probe[0]); }],
  ["ledger 구조", rows => { rows.columns.push({ ...column("status", "text", 1), schema: "hra_migrations", relation: "applied_migrations" }); }],
]) test(`${name} 변화는 digest를 바꾼다`, async () => {
  const original = fixture();
  const changed = structuredClone(original);
  change(changed);
  assert.notEqual(await digest(original), await digest(changed), "CATALOG_DRIFT_DETECTED");
});

test("고정 SELECT만 읽고 ledger row·targetnonce·temp를 읽지 않는다", async () => {
  const categories = [];
  await collectLocalCatalog(mock(fixture(), (sql, category) => {
    categories.push(category);
    assert.equal(/\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|SET)\b/i.test(sql), false, "CATALOG_READ_ONLY");
    assert.equal(sql.includes("hra_local_scope") || sql.includes("pg_temp"), false, "CATALOG_FIXED_SCOPE");
    if (category !== "probe") assert.equal(sql.includes("n.nspname IN ('public', 'hra_migrations')"), true, "CATALOG_SCHEMA_FILTER");
    assert.equal(/FROM\s+hra_migrations\.applied_migrations/i.test(sql), false, "CATALOG_NO_LEDGER_DATA");
  }));
  assert.equal(categories.length, 11);
});

test("probe가 없으면 사용자 row를 읽지 않으며 empty probe와 구분한다", async () => {
  const rows = fixture();
  rows.tables = rows.tables.filter(row => row.name !== "hra_migration_probe");
  rows.columns = [];
  const absent = await collectLocalCatalog(mock(rows, (_sql, category) => assert.notEqual(category, "probe")));
  const emptyRows = fixture(); emptyRows.probe = [];
  assert.equal(absent.counts.probeRows, 0);
  assert.notEqual(absent.digest, await digest(emptyRows));
});

test("알 수 없는 scope·부분 row·probe shape를 고정 오류로 차단한다", async () => {
  for (const [code, change] of [
    ["CATALOG_SCOPE_INVALID", rows => { rows.schemas[0].schema = "hra_local_scope"; }],
    ["CATALOG_SHAPE_INVALID", rows => { delete rows.functions[0].definition; }],
    ["CATALOG_SHAPE_INVALID", rows => { rows.functions[0].acl = sentinel; }],
    ["CATALOG_PROBE_SHAPE_INVALID", rows => { rows.columns[0].type_name = "int8"; }],
  ]) {
    const rows = fixture(); change(rows);
    await assert.rejects(collectLocalCatalog(mock(rows)), error => error.code === code && error.message === code);
  }
});

test("driver 원문 오류는 cause 없이 고정 코드로 대체한다", async () => {
  await assert.rejects(collectLocalCatalog({ query: async () => { throw Object.assign(new Error(sentinel), { detail: sentinel, query: sentinel }); } }), error => {
    assert.equal(error.code, "CATALOG_READ_FAILED");
    assert.equal(error.cause, undefined);
    assert.equal(String(error.stack).includes(sentinel), false);
    return true;
  });
});
