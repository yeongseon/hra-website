# 학생 본인 과제 조회 계약

학생의 과제 목록·상세에 어떤 데이터를 전달할지 수정할 때 읽는다. **조회 계약**은 로그인한 학생에게 보여줄 수 있는 행과 필드를 정한 규칙이다. **DTO**는 DB 전체 행 대신 화면에 필요한 정보만 골라 전달하는 객체다. 과제가 보인다는 사실과 새 파일을 제출할 수 있다는 사실은 각각 검사한다.

본인 조회 함수는 구현되어 있고 [학생 화면](academic-student-ui.md)이 이를 사용한다. 화면이 필요로 하는 필드를 확인한 뒤 아래 서버 진입점·권한·응답 순서로 읽는다. 새로운 필드를 추가할 때는 타인의 정보나 저장소 URL이 섞이지 않는지 조회 테스트로 확인한다. 용어는 [용어집](../getting-started/glossary.md)을 참고한다.

#150은 `MEMBER` 학생의 자기 과제 목록·상세·최종 제출 메타 조회를 서버 한 곳에 모은다. 선행 스키마 #144/#147/#148이 필요하다. 과제 관리 #149, 업로드·최종화 #151/#152, 파일 전달 #153과 학생 화면 #154는 각각 연결된 별도 구현이다. 운영 활성화는 별도 결정이며 기존 공동 자료실의 기수별 정책 #100은 변경하지 않는다.

## 서버 진입점

`src/features/academics/student-assignments/queries.ts`와 `src/lib/academic-permissions.ts`는 `server-only` 경계를 사용한다. 클라이언트 컴포넌트에서 가져오면 Next 빌드가 거부한다. Next 16의 내장 처리를 사용하므로 새 의존성을 설치하지 않는다.

| 함수 | 입력과 결과 |
| --- | --- |
| `getMyAssignments(input?: unknown)` | `{ page?: number, pageSize?: number }`. 기본 1페이지·20건, 최대 페이지 10,000·페이지 크기 50. `{ items, page, pageSize, hasNextPage }` 반환. |
| `getMyAssignment(assignmentId: string)` | 과제 UUID를 받아 본인 대상에 연결된 상세 DTO 반환. 권한이 없거나 존재하지 않으면 동일한 404 오류. |
| `canViewAssignment(assignmentId: string)` | 로그인·학생 역할·기능·현재 본인 대상 여부의 boolean 조회. DB/인증 장애는 503 오류를 유지한다. |
| `requireAssignmentTarget(selector: AssignmentTargetSelector)` | `{ assignmentId: string }` 또는 `{ targetId: string }` 한 가지만 허용. 현재 요청의 본인 대상이 아니면 오류. |
| `requireAcademicStudent()` | 실제 `auth()` 세션의 MEMBER 계정 UUID와 활성 gate를 확인하여 `{ userId }` 반환. 이것만으로 특정 과제 권한을 증명하지는 않는다. |

`requireAssignmentTarget`의 결과는 `AuthorizedAssignmentTarget`: `{ userId, assignmentId, targetId, status, dueAt: Date, publishedAt: Date }`다. #151/#152/#154의 서버 코드가 각 요청에서 재호출할 수 있다. 결과를 클라이언트에서 받아 다시 신뢰하거나 과거 결과를 권한 토큰처럼 재사용하지 않는다. 최종화·다운로드 시에도 각 작업의 공개·마감·파일 소유권 조건을 다시 검증해야 한다. 이 조회 계약은 파일 업로드 허가나 새 최종 제출 가능 여부까지 보장하지 않는다. `CLOSED`와 마감 이후 과제도 본인 열람은 허용한다.

내부 `data.ts`는 Drizzle 쿼리 작성기다. 페이지·액션은 이를 사용자 ID와 함께 직접 호출하지 않고 위 인증 진입점을 사용한다. 기존 Neon HTTP DB 연결을 유지한다. DB 사용자·학적·기수 식별자를 클라이언트 인수로 받지 않는다.

## 판단 순서와 DB 정책

1. 실제 `auth()` 세션을 읽고 계정 UUID를 확인한다.
2. `MEMBER`만 학생 경로에 허용한다. 관리 경로 #149/#155도 정확한 지정 승인자에게만 허용하며 `ADMIN` 역할만으로 접근하지 못한다. `FACULTY`는 담당 교수 정책 확정 전 학생 전체를 열람하지 못한다. `PENDING`과 비로그인도 차단한다.
3. `ACADEMIC_ENABLED`가 정확히 `true`인지 확인한다. 비활성 상태이면 신규 학사 테이블을 조회하지 않는다. 인증은 기존 인증 체계에 따라 자체 DB 확인을 할 수 있다.
4. 세션 계정 ID → `academic_students.user_id` → `cohort_enrollments` → `assignment_targets` → `assignments`를 조인한다. 각 실제 조회 문장은 현재 `users.role = MEMBER`도 다시 확인하여 인증 직후 역할 철회를 반영한다. 학적은 `ENROLLED`, `ended_at IS NULL`, 등록·생성 시각이 DB 현재 시각 이하이어야 한다. 학적과 과제의 기수도 일치해야 한다.
5. `PUBLISHED`/`CLOSED`, 공개 시각이 DB `CURRENT_TIMESTAMP` 이하인 과제만 반환한다. `DRAFT`, 미래 공개, 스냅샷 대상 없음, 미연결·종료 학적은 조회하지 못한다. `users.cohort_id`, 이메일, 지원서 상태를 학사 권한으로 사용하지 않는다.
6. 최종 제출은 본인 대상 ID와 현재 계정 ID를 함께 조건으로 LEFT JOIN한다. 파일 메타도 그 제출을 통해서만 읽는다. 상세는 공통 권한 조회 후 두 번째 본문 쿼리에도 동일한 조건을 반복하여 중간 학적 변경을 반영한다.

최초 공개 후 등록된 학생은 기존 과제 대상에 자동 포함되지 않는다. 과거 대상 행이 보존되어도 종료 학적의 학생 본인 열람은 이 G1 활성 학적 규칙을 따른다. 관리자 집계의 과거 분모 보존과는 별개의 조회 조건이다.

## 응답과 오류

목록 항목은 `{ assignmentId, targetId, title, status, dueAt, publishedAt, submission }`만 반환한다. `submission`은 미제출이면 `null`, 최종 제출이면 `{ submissionId, submittedAt }`이다. 상세는 여기에 `instructions`와 본인 `file` 메타 `{ fileId, originalName, mimeType, sizeBytes }`만 추가한다. 날짜는 ISO 문자열이다. 자기 제출·파일 ID는 별도 인증 다운로드 경로에서 사용하며 파일 URL 자체가 아니다. 현재 응답 타입은 `src/features/academics/student-assignments/contracts.ts`가 정의한다.

DB 응답 전체를 펼치지 않는다. 저장 키·URL·체크섬·멱등 키·타인 제출/파일 ID·학생 이름/학적 ID·이메일·자격 정보는 DTO에 포함하지 않는다. 미검증 업로드나 검증만 끝난 의도를 최종 제출 완료로 표시하지 않는다. 최종 제출의 파일 메타가 누락된 비정상 DB 결과도 완료 응답으로 반환하지 않는다.

오류는 `AcademicAccessError`의 고정 한국어 메시지와 `code`, `status`를 사용한다. DB/인증 원문은 응답이나 로그에 복사하지 않는다.

| 상황 | 코드 / 상태 |
| --- | --- |
| 비로그인·잘못된 세션 ID | `UNAUTHENTICATED` / 401 |
| 학생 MEMBER 외 역할 | `FORBIDDEN` / 403 |
| 기능 비활성 | `DISABLED` / 404 |
| 잘못된 과제/대상 UUID, 대상 없음, 타인, 타 기수, 비공개/미래 공개, 학적 없음 | `NOT_FOUND` / 404, 모두 `과제를 찾을 수 없습니다.` |
| 페이지 범위·자료형·추가 입력 필드 오류 | `INVALID_INPUT` / 422 |
| 인증/DB 장애·비정상 결과 | `UNAVAILABLE` / 503 |

서버 페이지는 `AcademicAccessError.status === 404`를 `notFound()`로 매핑하고 다른 오류는 기존 로그인/권한/장애 응답에 매핑한다. 액션/API도 같은 상태를 사용한다. 함수가 `null`을 반환하는 별도 상세 계약은 없다. 부모 페이지에서 로그인했다는 이유로 하위 쿼리 검사를 생략하지 않는다. 개인화 페이지/파일 응답은 공개 캐시에 저장하지 않으며 G1 학생 화면 #154와 파일 전달 #153에서 동적 렌더링·응답 캐시 정책을 적용한다.

## 검증

- 단위 테스트: 실제 공개 함수의 역할 gate, 인증 다음 기능 gate, 잘못된 세션·직접 ID, 제한된 입력, 목록/상세 DTO, 장애 메시지 검증.
- 격리 PostgreSQL: 공개 함수가 만든 Drizzle SQL을 그대로 PREPARE/EXECUTE한다. Neon HTTP 전송과 인증 세션만 대체하고 실제 조인·조건·정렬·페이지네이션·Drizzle 타입 매핑·DTO는 운영 코드를 사용한다.
- ADMIN/MEMBER A/MEMBER B/같은 기수 MEMBER C/FACULTY/PENDING/비로그인, 초안/미래/공개/종료, 미연결·종료 학적, 공개 후 신규 등록, 타인 target 추측과 타인 파일 비노출을 확인한다. ADMIN/FACULTY/PENDING에도 학적을 연결하여 역할 gate가 DB 조회 전에 차단하는지 검증한다.
- 테스트는 자체 임시 PostgreSQL을 생성하고 운영 환경 파일이나 네트워크 DB를 읽지 않는다.

```sh
HRA_TEST_PG_BIN=/opt/homebrew/opt/postgresql@18/bin npx vitest run tests/unit/academic-student-query-*.test.ts
npm run typecheck
npx eslint src/lib/academic-permissions.ts src/features/academics/student-assignments tests/unit/academic-student-query-*.test.ts
```

