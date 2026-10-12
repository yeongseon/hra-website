/**
 * 기수 정렬 공통 유틸.
 *
 * 역할:
 *   기수명("1기", "20기")에 들어 있는 숫자를 기준으로 최신 기수부터 정렬하는 ORDER BY 조각을 만든다.
 *
 * 사용 위치:
 *   기수 목록을 조회하는 공개·회원·관리자 페이지 (자료실, 회원 관리, 기수 관리 등).
 *
 * 왜 한 곳에 두는가 (#115):
 *   예전에는 각 페이지가 `CAST(regexp_replace(name, '[^0-9]', '', 'g') AS INTEGER)` 를 직접 썼다.
 *   기수명에 숫자가 하나도 없으면 (예: "특별반") 빈 문자열을 INTEGER 로 바꾸다 쿼리 전체가 실패해,
 *   이름 하나 때문에 자료실·회원 관리·기수 목록이 통째로 열리지 않았다.
 *   숫자를 이어 붙인 값이 INTEGER 범위를 넘어도 같은 문제가 생겼다.
 */

import { sql, type AnyColumn, type SQL } from "drizzle-orm";

/**
 * 기수명 안의 숫자가 큰 순서(최신 기수 먼저)로 정렬하는 ORDER BY 조각.
 *
 * - NULLIF(..., ''): 숫자가 없는 이름은 NULL 로 바꿔 캐스트 오류를 막는다.
 * - ::numeric: 자릿수 제한이 없어 긴 숫자에서도 넘치지 않는다.
 * - NULLS LAST: 숫자가 없는 기수는 목록 맨 뒤에 둔다.
 */
export function cohortNumberDesc(nameColumn: AnyColumn): SQL {
  return sql`NULLIF(regexp_replace(${nameColumn}, '[^0-9]', '', 'g'), '')::numeric DESC NULLS LAST`;
}
