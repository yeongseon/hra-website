// neon-http 드라이버에서 여러 row 의 정수 컬럼(주로 sort order)을 원자적으로 갱신하는 헬퍼.
//
// [배경]
// - 현재 DB 접근은 `drizzle-orm/neon-http` 를 통해 HTTP 로 이루어짐 (`src/lib/db/index.ts`).
// - neon-http 는 `db.transaction()` 을 지원하지 않는다.
// - 드래그앤드롭 순서 변경(reorder) 액션을 `for` 루프로 개별 UPDATE 하면
//   중간에 실패했을 때 일부만 반영되어 정렬 상태가 뒤엉킴 (partial reorder).
//
// [해결]
// - 단일 `UPDATE ... SET col = CASE id WHEN ... THEN ... END WHERE id IN (...)` 문 하나로 처리.
// - Postgres 는 single statement 는 statement-level atomic 이므로 partial 반영이 원천 차단된다.
//
// [보안]
// - 모든 사용자 입력(id, value)은 Drizzle `sql` 태그의 파라미터로 나감 (`$1`, `$2`, ...).
// - `${a.id}::uuid` 캐스트는 파라미터 값 뒤에 붙는 SQL 조각이라 injection 위험 없음.
// - 컬럼 이름은 `sql.identifier(col.name)` 로 escape.
//   (일반 컬럼 인터폴레이션은 `"table"."col"` 로 qualify 되어 PG `UPDATE SET` 좌변에 부적합)

import { inArray, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";

// 여러 row 의 정수 컬럼을 단일 SQL UPDATE 로 한번에 갱신한다.
// assignments 는 { id, value } 쌍의 배열. 각 id 에 해당하는 row 의 targetColumn 을 value 로 설정한다.
// extraWhere 는 소유권 검증 등 추가 WHERE 조건 (선택).
// 반환값의 affected 는 실제 갱신된 row 수 — 호출부에서 assignments.length 와 비교해
// "존재하지 않는 ID" / "중복 ID" 등을 검출할 수 있다.
export async function reorderByCase<T extends PgTable>(params: {
  table: T;
  idColumn: AnyColumn;
  targetColumn: AnyColumn;
  assignments: readonly { id: string; value: number }[];
  extraWhere?: SQL;
}): Promise<{ affected: number }> {
  const { table, idColumn, targetColumn, assignments, extraWhere } = params;

  if (assignments.length === 0) {
    return { affected: 0 };
  }

  // CASE WHEN <id> THEN <value> 조각들 — 각 값은 파라미터로 바인딩됨
  const cases = assignments.map(
    (a) => sql`WHEN ${idColumn} = ${a.id}::uuid THEN ${a.value}`
  );
  const ids = assignments.map((a) => a.id);

  // SET 좌변은 unqualified column name 이어야 하므로 sql.identifier 로 이름만 렌더링
  const targetName = sql.identifier(targetColumn.name);

  const whereClause = extraWhere
    ? sql`${inArray(idColumn, ids)} AND ${extraWhere}`
    : inArray(idColumn, ids);

  const result = await db.execute(sql`
    UPDATE ${table}
    SET ${targetName} = CASE ${sql.join(cases, sql` `)} END
    WHERE ${whereClause}
  `);

  return { affected: result.rowCount ?? 0 };
}
