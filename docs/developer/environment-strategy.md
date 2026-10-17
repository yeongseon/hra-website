# HRA 환경 분리 및 배포 전략

> 상태: 운영 전 목표 정책. 전체 배포 추적은 #284, 환경 분리는 #279를 따른다.

HRA는 예상 사용자 약 1~200명 규모를 기준으로 **환경은 분리하되 인프라는 단순하게** 유지한다. 사용자 수가 적더라도 Production 데이터와 비운영 테스트는 분리한다. 다만 별도 Dev/QA/Staging 서버를 모두 상시 운영하지 않는다.

## 1. 기본 환경

기본은 세 단계다.

```text
Local Development
  - 개발자 PC
  - local PostgreSQL 또는 개인 Neon dev branch
  - 개발용 OAuth / Blob
        ↓
Pull Request
        ↓
PR Preview / Test
  - Vercel Preview
  - PR별 격리 Neon branch
  - Test Blob / Private Blob
  - synthetic 또는 anonymized data
        ↓
Merge + Migration Gate
        ↓
Production
  - Vercel Production
  - Production Neon
  - Production Blob / Private Blob
  - 실제 사용자 데이터
```

## 2. Staging은 기본 환경이 아니다

고정 Staging은 처음부터 상시 운영하지 않는다.

다음 조건이 생기면 추가한다.

- Google Play Internal Testing 또는 TestFlight가 안정적으로 참조할 고정 API URL이 필요함
- 모바일 OAuth callback/deep link를 PR Preview URL로 관리하기 어려움
- Store release 전에 운영과 동일한 설정 조합을 반복 검증해야 함
- 외부 기관/운영진이 같은 pre-production 환경에서 검수해야 함

이전에는 PR Preview/Test만 사용한다.

Staging을 만들 경우 Production과 다음을 공유하지 않는다.

- DB
- Blob / Private Blob
- OAuth client secret
- 실제 사용자 session/token
- 실제 PII

Production 데이터를 그대로 복제하지 않는다. 실데이터 구조가 필요한 검증은 synthetic fixture 또는 승인된 anonymized dataset을 사용한다.

## 3. 환경별 역할

| 구분 | Local Dev | Preview/Test | Staging(조건부) | Production |
| --- | --- | --- | --- | --- |
| 대상 | 개발자 | PR 검증 | 모바일/릴리스 검수 | 실제 사용자 |
| Web | localhost | Vercel Preview | 고정 pre-prod URL | Vercel Production |
| DB | local/개인 branch | PR별 격리 branch | 별도 staging DB | Production DB |
| Blob | 개발 저장소 | Test 저장소 | Staging 저장소 | Production 저장소 |
| OAuth | 개발 client | Preview client 또는 제한 | Staging client | Production client |
| PII | 금지 | synthetic/anonymized | synthetic/anonymized | 허용 |
| destructive test | 격리 환경만 | 격리 fixture만 | 승인된 fixture만 | 금지 |
| migration | 로컬 검증 | 격리 검증 | 필요 시 rehearsal | 승인 후 적용 |

## 4. 데이터베이스 원칙

### Production DB

실사용 데이터의 정본이다.

- 개발 편의를 위해 직접 연결하지 않는다.
- PR Preview에서 연결하지 않는다.
- migration은 Vercel build 안에서 자동 실행하지 않는다.
- destructive migration은 사람 승인과 백업/복구 확인 없이 실행하지 않는다.

### Development / Preview DB

Production과 분리한다.

권장 순서:

1. 로컬 개발자는 local PostgreSQL 또는 개인 Neon branch 사용
2. PR은 고유한 Preview DB branch 사용
3. PR 종료 뒤 Preview DB 정리
4. 필요한 schema/migration은 Preview DB에서 재현

실사용 이후 Production 데이터를 기반으로 테스트해야 한다면 실제 PII를 그대로 복사하지 않고 anonymization 절차를 둔다.

## 5. Blob 및 파일 저장소

DB만 분리하고 Blob을 공유하면 환경 분리 목적을 달성하지 못한다.

환경별로 다음 저장소를 구분한다.

- public content Blob
- protected resource Private Blob
- academic submission Private Blob

Preview/Staging에서 Production Blob token을 사용하지 않는다.

특히 보호 자료와 학사 제출은 다음을 지킨다.

- server token은 클라이언트로 전달하지 않음
- Preview에서 Production object를 읽거나 삭제하지 않음
- cleanup job도 해당 환경의 저장소만 대상으로 함
- synthetic fixture object만 생성/삭제

## 6. OAuth와 인증

환경별 callback URI와 client 설정을 분리한다.

Web:

```text
Development  → localhost callback
Preview/Test → Preview 전용 callback 또는 명시적 비활성
Staging      → 고정 staging callback
Production   → production callback
```

Mobile:

- Android/iOS production app이 Preview callback을 사용하지 않는다.
- internal build가 고정 backend URL을 요구하면 그 시점에 Staging을 도입한다.
- Web Auth.js cookie와 Mobile token session은 환경을 교차하지 않는다.
- refresh token/session record는 환경별 DB에만 존재한다.

## 7. 환경변수 정책

모든 환경변수는 최소 다음 메타데이터를 가진다.

- 이름
- 용도
- secret 여부
- 필수/선택
- Development/Preview/Staging/Production 적용 범위
- 누락 시 fail-open/fail-closed 동작
- 소유 시스템(DB/Auth/Blob/Cron/Mobile)

예:

```text
DATABASE_URL
  secret: yes
  dev: local/dev DB
  preview: preview DB
  staging: staging DB
  production: production DB
  cross-environment reuse: 금지
```

새 환경변수를 추가할 때 `.env.example`과 배포 문서를 함께 수정한다.

## 8. Cron / Background Job

Cron job도 환경을 구분한다.

- Production Cron은 Production DB/Storage만 접근
- Preview 배포에서 Production Cron secret을 사용하지 않음
- destructive cleanup은 별도 feature gate와 승인 조건 유지
- Staging Cron은 실제 필요할 때만 켜고 Production과 별도 secret 사용

## 9. 배포와 Migration 순서

기본 순서:

```text
PR
 ↓
CI / migration replay / contract test
 ↓
Preview
 ↓
Review
 ↓
Merge
 ↓
Production migration gate
 ↓
schema/function verification
 ↓
Web production deploy / promotion
```

migration이 없는 변경은 DB gate를 건너뛸 수 있다. migration이 있는 변경은 새 코드가 먼저 배포되어 미적용 schema를 호출하지 않도록 순서를 명시한다.

## 10. Web / Mobile 배포 분리

Monorepo 이후:

```text
apps/web
  → Vercel

apps/mobile
  → Expo EAS
     ├ Android → Google Play
     └ iOS     → App Store
```

Web 배포, GitHub Release, Android release, iOS release는 같은 이벤트로 강제로 묶지 않는다. 각각 독립적으로 재실행/롤백할 수 있어야 한다.

## 11. 이 규모에서 하지 않는 것

1~200명 규모에서는 다음을 기본 요구사항으로 두지 않는다.

- Kubernetes
- 상시 QA 서버
- 상시 Dev 서버
- 다중 region active-active
- microservice
- 별도 DB cluster 여러 개의 상시 운영

환경 분리는 **안전성 문제**, 인프라 규모는 **트래픽 문제**이므로 둘을 혼동하지 않는다.

## 12. 완료 기준

#279가 완료되려면 최소 다음이 확인돼야 한다.

- Local/Preview/Production DB가 분리됨
- Preview가 Production PII/Blob을 보지 못함
- 환경별 secret scope가 문서화됨
- migration과 Vercel build가 분리됨
- Staging 도입 조건이 문서화됨
- 모바일 내부 테스트 전까지 불필요한 상시 Staging을 만들지 않음

배포 전체 추적은 #284를 따른다.
