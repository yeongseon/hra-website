// @vitest-environment node
/**
 * 기수 정렬 식 회귀 테스트 (#115)
 *
 * 검증 대상 (src/lib/db/cohort-order.ts):
 *   - 숫자가 없는 기수명에서 캐스트 오류가 나지 않도록 NULLIF 로 감싸는지
 *   - INTEGER 범위를 넘지 않도록 numeric 으로 변환하는지
 *   - 숫자가 없는 기수를 맨 뒤로 보내는지 (NULLS LAST)
 *
 * 여기서는 생성되는 SQL 문자열만 확인한다. 실제 PostgreSQL 에서의 동작(숫자 없는 이름,
 * 매우 긴 숫자)은 PR 에 기록한 수동 검증으로 확인했다.
 */

import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { cohortNumberDesc } from "@/lib/db/cohort-order";
import { cohorts } from "@/lib/db/schema";

const render = () => new PgDialect().sqlToQuery(cohortNumberDesc(cohorts.name));

describe("cohortNumberDesc", () => {
  it("빈 문자열을 NULL 로 바꾼 뒤 numeric 으로 변환한다", () => {
    const { sql } = render();
    expect(sql).toContain("NULLIF(regexp_replace(");
    expect(sql).toContain(", '')::numeric");
    expect(sql).not.toMatch(/AS INTEGER/i);
  });

  it("최신 기수 먼저, 숫자 없는 기수는 맨 뒤로 정렬한다", () => {
    expect(render().sql).toMatch(/DESC NULLS LAST$/);
  });

  it("기수명 컬럼을 참조하고 바인딩 파라미터를 쓰지 않는다", () => {
    const { sql, params } = render();
    expect(sql).toContain('"cohorts"."name"');
    expect(params).toEqual([]);
  });
});
