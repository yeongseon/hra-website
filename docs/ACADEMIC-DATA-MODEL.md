# HRA 학사 데이터 모델 및 접근 제약 (설계안)

> 상태: **구현 전 검토용** · 범위: G1 학적·과제 MVP와 향후 G2/G3 확장.
> 현재 `src/lib/db/schema.ts`의 테이블을 변경하지 않은 설계 제안이다. 이 문서의 필드·ENUM·삭제 정책은 마이그레이션 승인 전에는 확정 스키마가 아니다.

## 1. 기존 엔터티 재사용과 금지사항

- 기존 `users`는 로그인 계정 및 시스템 역할의 정본이다. `users.role`을 재학·수료·탈퇴로 확장하지 않는다.
- `cohorts`는 교육 기수의 정본이다. `users.cohortId`는 현재 회원 UI 호환을 위한 기존 필드로만 다루고, 학적 이력의 정본으로 사용하지 않는다.
- 기존 `schedule_events`와 `schedule_sessions`는 수업일·시간 구성·교수·카테고리의 정본이다. G1에서 복제된 수업 테이블을 만들지 않는다.
- **HRA 실제 운영 구분:** 교수는 수업을 담당하지만 **출결을 담당하지 않는다**. 수업에는 **어드바이저(Advisor)**라는 별도 수업 운영 담당자가 존재한다. 따라서 `schedule_sessions.facultyId`로 출결 담당자를 추론하지 않으며, G2에서 배정된 어드바이저와 출결 변경 주체를 별도로 연결한다.
- `weekly_texts` / `class_logs` / `report_templates`는 공동 학습 자료다. 개인별 과제 실적을 이들 행의 개수로 계산하지 않는다.
- `application_submissions`는 **지원 이력**이지 학적의 정본이 아니다. `status=ACCEPTED`를 곧바로 유효한 학적/로그인 권한으로 해석하지 않는다.

## 2. G1 엔터티 (권장 스키마)

다음 이름은 제안이며, 단계별 독립 PR에서 실제 Drizzle 타입·DB migration으로 확정한다.

### A. `academic_students` — 학적의 학생 식별자

| 필드 | 타입(제안) | 제약·의미 |
| --- | --- | --- |
| `id` | UUID | PK; 학생 식별자는 이메일이 아님 |
| `user_id` | UUID nullable | 기존 `users.id`에 FK; NULL 허용, non-null UNIQUE, 탈퇴 시 연결 해제 정책 별도 결정 |
| `display_name` | varchar(100) | 최소 표시 이름, 확인된 명부 입력값; 추가 PII 저장 최소화 |
| `created_at`, `updated_at` | timestamptz | 시각 이력 |

계정 없는 합격·초청 명부를 처리해야 하면 `academic_students.user_id=NULL`을 유지할 수 있다. 학적 대상에서 제외할 필요는 없지만 **로그인과 제출 권한은 계정 검증 후에만** 부여한다. 이메일 복제와 자동 계정 연결은 금지한다. `application_submissions`과의 검증된 연결이 필요하면 별도 nullable 출처 FK 또는 전용 매핑을 두고, 원문 지원서 전체를 중복 복사하지 않는다.

### B. `cohort_enrollments` — 학생의 기수별 학적

| 필드 | 타입(제안) | 제약·의미 |
| --- | --- | --- |
| `id` | UUID | PK, 제출/출결이 참조하는 영속 식별자 |
| `student_id` | UUID | `academic_students.id` FK, NOT NULL |
| `cohort_id` | UUID | `cohorts.id` FK, NOT NULL |
| `status` | enum | 초기 `ENROLLED`, 이후 `COMPLETED`, `WITHDRAWN` 등 정책 확정 |
| `enrolled_at`, `ended_at` | timestamptz | 등록·종료 이력 |
| `created_by_user_id` | UUID nullable | 행 생성 관리자 식별자 |
| `created_at`, `updated_at` | timestamptz | 감사용 시각 |

- `UNIQUE(student_id, cohort_id)`: 동일 학생·동일 기수 중복 등록 금지. 복학/재참여가 실제 필요할 때만 별도 회차 개념을 검토한다.
- 학적이 존재하는 기수/학생을 물리 삭제하지 않도록 `RESTRICT` 또는 업무상 삭제 거부 정책을 우선 검토한다. 초기 G1에서는 재학 외 복잡한 상태 전환 UI를 구현하지 않는다.
- 다른 기수에 등록한 적 있는 학생의 기존 학적은 남아야 한다. 계정 역할 변경이 학적 기록을 소급 변경하지 않는다.
- **동시 이중 등록**은 서버 사전 SELECT만으로 막지 않고 DB UNIQUE로 보장한다.

### C. `assignments` — 과제 정의

| 필드 | 타입(제안) | 제약·의미 |
| --- | --- | --- |
| `id` | UUID | PK |
| `cohort_id` | UUID | FK, 과제 대상 기수 (G1은 1개 기수) |
| `schedule_event_id` | UUID nullable | 기존 `schedule_events` FK; 연결 시 같은 기수 검증 |
| `schedule_session_id` | UUID nullable | 기존 `schedule_sessions` FK; 연결 시 이벤트·기수 교차 검증 |
| `title`, `instructions` | varchar/text | 서버 길이 제한·내용 정제 |
| `due_at` | timestamptz nullable | 명시적 KST 입력 → UTC instant 저장; 마감 정책 D4 필요 |
| `status` | enum | `DRAFT`/`PUBLISHED`/`CLOSED` 제안; 허용 전이 규칙 필요 |
| `created_by_user_id` | UUID | 작성 관리자 |
| `published_at`, `created_at`, `updated_at` | timestamptz | 공개/감사 |

- 비공개 과제의 UUID를 알아도 MEMBER가 조회·제출하지 못해야 한다.
- 이미 제출자가 있는 과제를 삭제하거나 대상 기수·문항 의미를 변경하면 기존 이력의 의미가 깨질 수 있으므로 불변 필드/비활성화 정책이 필요하다.
- 기존 수업과 연결되는 과제는 참조 무결성에 더해 **수업과 과제 기수가 같아야 함**을 트랜잭션/서버에서 검증한다.

### D. `assignment_targets` — 발행 당시 과제 대상자 (제안, G1에서 검토)

| 필드 | 타입 | 제약·의미 |
| --- | --- | --- |
| `id` | UUID | PK |
| `assignment_id` | UUID | FK; 과제 |
| `enrollment_id` | UUID | FK; 과제 대상 학적 |
| `assigned_at` | timestamptz | 대상 확정 시각 |
| `assigned_by_user_id` | UUID nullable | 관리자/시스템 |

- `UNIQUE(assignment_id, enrollment_id)`로 이중 대상 생성 금지.
- **발행 시 대상 스냅샷**을 권장한다. 명부가 나중에 달라져도 이전 과제의 제출률 분모가 조용히 바뀌지 않는다.
- 발행 이후 편입·탈퇴 학생을 과제 대상에 추가·제외할 정책은 G1 구현 전 결정해야 한다. 변경 시 감사 이력 필수.
- 보장할 지표: 대상 N, 제출 S, 미제출 N-S. `assignment_submissions`만으로 대상을 계산하지 않는다.

### E. `assignment_submissions` — 과제 제출 사실

| 필드 | 타입(제안) | 제약·의미 |
| --- | --- | --- |
| `id` | UUID | PK |
| `assignment_target_id` | UUID | FK; 제출자와 과제를 하나의 확정 대상으로 식별 |
| `submitted_by_user_id` | UUID | 실제 제출 계정; 해당 target의 학생과 동일인 검증 |
| `submission_key` | UUID 또는 고유 문자열 | 요청 재시도 멱등성 키, UNIQUE |
| `submitted_at` | timestamptz | **최종 제출 확정** 시각 |
| `created_at` | timestamptz | 행 생성 시각 |

- G1 한 대상당 최종 제출 1개 정책을 선택하면 `UNIQUE(assignment_target_id)`. D5에서 재제출 허용 시 기존 행을 덮어쓰기보다 별도 attempts/versions 도입을 권장한다.
- DB에 최종 제출 행이 생기기 전 업로드만 성공한 상태를 `SUBMITTED`로 표시하지 않는다.
- 명시적인 상태 모델이 필요하면 임시 업로드와 최종 제출을 별도 테이블로 구분한다. 모든 파일 처리 실패를 제출 성공/실패 행에 섞어 기록하지 않는다.
- 출석·수료 같은 향후 도메인이 사용자 이메일이 아닌 영속적인 `enrollment_id`를 참조하도록 일관성을 유지한다.

### F. `assignment_submission_files` 및 `assignment_upload_intents`

`assignment_submission_files` 필드: `id`, `submission_id` FK, 불투명 `storage_key`, `original_name`, `mime_type`, `size_bytes`, `checksum`(가능하면), `created_at`.

`assignment_upload_intents`(또는 동등한 임시 업로드 영수증): `id`, `target_id`, `user_id`, `storage_key`, `expires_at`, `state`, `created_at`. 업로드 승인과 최종 제출을 연결해, 클라이언트가 임의 Blob URL을 제출한 것으로 확정하지 못하게 한다.

- 저장 키는 고유·추측 어려운 값이어야 하며, 한글 원본 파일명과 저장 경로를 분리한다.
- 파일을 전송한 사람·대상 과제·실제 저장된 객체·크기/유형을 **서버에서 재검증**한다.
- 기존 공용 `access: public` 업로드/이미지 정리 헬퍼를 그대로 제출물에 재사용하지 않는다.
- 사용자의 직접 다운로드는 `GET /api/academic/submissions/[id]/file/[fileId]` 같은 인증된 API에서 매번 객체 수준 접근을 확인한다. 외부 서비스에 장기 유효 URL을 노출하지 않는다.
- 업로드 중단·만료·DB 실패 시 고아 객체 정리와 재시도 정책을 명시한다. **다른 제출물이 참조 중인 객체는 삭제하지 않는다.**
- Vercel Function의 4.5MB 본문 제한은 `serverActions.bodySizeLimit` 확대만으로 해제되지 않는다. 큰 파일은 공급자가 지원하는 인증된 브라우저→비공개 스토리지 직접 업로드를 검토한다.
- 파일 포맷은 확장자+매직 바이트 검증, 크기·개수·요청 제한, 바이러스/악성코드 정책은 데이터 민감도에 맞춰 단계화한다.

공식 자료: [Vercel Functions 한도](https://vercel.com/docs/functions/limitations), [Vercel Private Blob](https://vercel.com/docs/vercel-blob/private-storage), [Client Upload](https://vercel.com/docs/vercel-blob/client-upload).

## 3. 읽기/쓰기 불변조건과 질의 원칙

**I1 — 소유권**: 학생 A의 로그인 계정은 학생 B의 학적/제출/파일을 읽거나 확정할 수 없다. 같은 기수 소속만으로는 타인 파일 조회 권한이 생기지 않는다.

**I2 — 대상 기수**: `assignment_targets.enrollment_id`가 가리키는 기수는 반드시 해당 `assignments.cohort_id`와 일치한다. 클라이언트가 전달한 user/cohort ID를 그대로 신뢰하지 않는다.

**I3 — 미제출 집계**: `assignment_targets LEFT JOIN assignment_submissions`으로 명부 전체를 반환하고, 제출 유무는 최종 확정된 행만으로 판단한다. 제출이 없는 학생 0행도 결과에 포함한다.

**I4 — 멱등성**: 같은 업로드 의도/제출 키 재시도는 기존 완료 결과를 반환한다. 서로 다른 두 요청이 동시에 제출해도 허용된 최종 제출 개수(초기 1개)를 넘지 않는다.

**I5 — 원자성**: 제출 사실·제출 파일 메타데이터·처리 완료 표시는 원자적으로 확정한다. DB 트랜잭션과 Blob 쓰기는 별도 시스템이므로 보상/재시도/청소 상태를 분리한다.

**I6 — 이력 보존**: 기수 삭제, 계정 탈퇴, 과제 비공개화/종료, 새 기수 등록이 과거의 합법적으로 보존해야 할 제출 사실을 연쇄 삭제하지 않는다.

**I7 — KST**: 마감 정책을 명시적으로 `Asia/Seoul`로 해석한 뒤 UTC instant 저장 및 비교한다. 정각 경계(전/후)와 일광절약시간 없는 한국 표준시 기준 테스트를 포함한다.

## 4. 마이그레이션·백필 계획

1. 기존 DB 테이블·FK/UNIQUE·실제 데이터 카디널리티를 **읽기 전용**으로 조사한다.
2. `academic_students` / `cohort_enrollments` 등의 새 테이블 생성 migration을 버전 관리한다. 기존 컬럼 삭제·덮어쓰기 금지.
3. 현재 `MEMBER` + 유효한 `users.cohortId`의 후보 행을 dry-run으로 표시하되 **누락/중복/관리자·교수의 기존 참여 이력**은 수동 확인 대상으로 출력한다.
4. 계정 없는 등록 대상은 관리자 검증 후 학생 엔터티로 생성한다. 이메일 동등성만으로 자동 매칭하지 않는다.
5. 기존 권한/회원 화면은 변경 없이 남기고, 새 학사 경로만 신규 학적 기반으로 동작시킨다.
6. 스테이징 DB에서 backfill 재실행(멱등성), 유일성, rollback/forward-fix, 삭제 제한을 검증한다.
7. 운영 백업 및 복원 시험 증거 확보 후 승인된 migration을 배포한다. 적절한 기간 동안 기존 `users.cohortId`와 신규 학적 간 불일치를 리포트한다.
8. 이행 후에만 호환 필드 축소를 별도 결정한다.

## 5. G2/G3 후보 (지금 생성하지 않음)

### G2: 수업 어드바이저(Advisor)와 출결 데이터 분리

**확인된 사실:** 출결은 교수가 담당하지 않는다. 수업 운영 인력은 **어드바이저 1명과 조교 2명**이고 **세 사람이 돌아가며 출결을 체크한다.** 인력은 **기수마다 다르고** 기수 안에서는 **고정 배정**이지만, **조교는 학기 중에 바뀔 수 있고** 향후 역할도 바뀔 수 있다. 이들을 관리하는 담당자는 홈페이지 관리자(`ADMIN`)와 **다른 사람**이며 `ADMIN` 은 홈페이지만 관리한다. **설계 반영:** 아래 배정 테이블은 수업일별이 아니라 **기수 단위 기간 배정**(`cohort_id`, `role`(ADVISOR/ASSISTANT), `starts_at`, `ends_at`)으로 바꾸고, 출결 권한은 해당 기수에 **현재 유효한** 배정을 가진 어드바이저·조교 모두에게 준다. 학기 중 교체에 대비해 같은 기수·역할의 배정 행을 여러 개 둘 수 있어야 하며, 과거 출결 기록의 입력자는 교체 후에도 보존한다. 배정·교체 권한은 `ADMIN` 이 아닌 별도 학사 운영 관리 권한에 둔다. **추가 정책 확인(#143):** 출결 정정·최종 승인 절차, 학사 운영 관리 권한의 범위와 부여 방식.

- `cohort_attendance_assignments(id, cohort_id, user_id, role, starts_at, ends_at, assigned_by_user_id)` 제안: 기수별 어드바이저·조교의 유효 기간과 교체 이력을 기록한다. 동일 계정·기수·역할의 유효 기간 중복을 방지하고, 종료 후 권한을 회수한다. 동시 배정 인원과 교체 승인 절차는 #143에서 확정한다.
- 운영 인력은 검증된 로그인 사용자에 연결되는 **기수 단위 업무 역할**로 취급한다. 전역 `ADVISOR`/`ASSISTANT` enum 도입은 별도 운영 요구가 확인된 뒤 결정한다. 기존 `FACULTY` 및 홈페이지 `ADMIN` 역할만으로 출결 권한을 주지 않는다.
- `canManageAttendance(session, scheduleEventId)`: 해당 CLASS 수업일의 기수와 **현재 유효한 어드바이저·조교 배정**을 함께 검증한다. 배정되지 않은 사용자, 다른 기수 배정자, `FACULTY`/`ADMIN` 역할만 가진 사용자, PENDING·비로그인은 거부한다. 정정·최종 승인과 별도 학사 운영 관리자 권한은 #143 정책으로 결정한다.
- 어드바이저·조교의 명부 접근은 **해당 기수의 출결 대상 학생 최소 정보**로 제한한다. 과제 평가·개인 제출 파일·다른 기수 학적은 기본 열람 대상으로 삼지 않는다.
- 교수/교수 프로필(`faculty`)과 운영 인력 배정은 별도 정본이다. 양자를 동일한 ID나 로그인 역할로 통합하지 않는다.

관련 작업: [#165 수업 Advisor 배정 및 권한](https://github.com/yeongseon/hra-website/issues/165), [#159 출결 모델](https://github.com/yeongseon/hra-website/issues/159), [#160 출결 UI](https://github.com/yeongseon/hra-website/issues/160).

- `attendance_records(enrollment_id, schedule_event_id, state, recorded_by_user_id, updated_at)` 제안: `UNIQUE(enrollment_id, schedule_event_id)`. 실제 기록 행 부재(`UNMARKED`/미입력에 해당)와 명시적 `ABSENT`/결석은 다르다. 학생의 기수는 수업 기수와 일치해야 한다. `recorded_by_user_id`가 교수의 `facultyId`와 같다고 추정하지 않는다.
- `attendance_change_history(attendance_record_id, previous_state, next_state, changed_by_user_id, reason, changed_at)` 또는 공통 감사 로그: 최초 입력·정정·취소의 주체/사유/시간을 보존하고 당시 어드바이저·조교 배정의 유효 여부를 검증한다. 세션별 출석 필요성은 미확정이다.
- `academic_audit_logs(actor_user_id, resource_type, resource_id, action, before_summary, after_summary, reason, occurred_at)`: 내용 전문·민감 URL 금지, 보존 기간·열람권 분리.
- `assignment_reviews`: 별도 정책에 따라 담당 교수/운영진 검토, 피드백, 과거 버전 추적 (G3). 이 권한을 출결 입력·정정 권한과 결합하지 않는다.
- `completion_decisions`: 수료 조건 버전·운영진 승인·예외 사유·확정 시각 (G3).

새 엔터티 추가는 운영 정책과 이용자 요구가 확인되었을 때만 진행한다. 선제적인 학점/학과/학기 테이블은 만들지 않는다.
