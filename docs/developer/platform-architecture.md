# HRA 멀티클라이언트 플랫폼 아키텍처

> 상태: **목표 아키텍처**. 현재 `main`의 디렉터리 구조를 설명하는 문서가 아니라 #277에서 진행하는 구조 개편의 정본이다.

HRA는 Web만 제공하는 사이트에서 **Web + Android + iOS**를 지원하는 하나의 서비스 플랫폼으로 확장한다. 실서비스 전 구조 변경 비용이 낮은 시점을 활용하되, 이미 검증된 학사 도메인·DB 제약·인가·Private Blob·감사·테스트를 버리지 않는다.

## 1. 아키텍처 결정

HRA의 목표는 **API-first modular monolith + monorepo**다.

- 서버는 하나의 배포 단위와 하나의 PostgreSQL을 유지한다.
- 기능은 명확한 module boundary로 나눈다.
- Web, Android, iOS가 같은 application service와 authorization 정책을 사용한다.
- Android/iOS는 별도 앱 두 개가 아니라 **React Native + Expo 단일 코드베이스**를 사용한다.
- Microservice, Kafka/RabbitMQ, 분산 트랜잭션은 실제 독립 확장 필요가 생기기 전까지 도입하지 않는다.

```text
                        Clients
          ┌──────────────┼──────────────┐
          │              │              │
        Web          Android          iOS
       Next.js          React Native
          │              │              │
          └──────────── API v1 ─────────┘
                          │
                   Authentication
                          │
                      Principal
                          │
                Application Services
                          │
             ┌────────────┼────────────┐
             │            │            │
         Academics      Content      Identity
             │            │            │
             └────── Repositories ─────┘
                          │
                     PostgreSQL
                          │
               Blob / Push / External
```

## 2. 목표 저장소 구조

구조 전환 완료 뒤의 기준 형태다. 세부 폴더 이름은 PR에서 조정할 수 있지만 계층 책임은 유지한다.

```text
hra/
├── apps/
│   ├── web/                  # Next.js: 화면·Web adapter
│   └── mobile/               # React Native + Expo: Android/iOS 공통
│
├── packages/
│   ├── contracts/            # OpenAPI, DTO, error code
│   ├── schemas/              # 클라이언트에서도 안전한 순수 validation
│   ├── shared/               # 날짜/상수/pure utility
│   ├── design-tokens/        # 선택적 색상/spacing token
│   └── config/               # tsconfig/eslint 등 공통 설정
│
├── server/
│   ├── modules/
│   │   ├── identity/
│   │   ├── users/
│   │   ├── academics/
│   │   ├── assignments/
│   │   ├── resources/
│   │   ├── notices/
│   │   ├── schedules/
│   │   └── applications/
│   │
│   ├── infrastructure/
│   │   ├── db/
│   │   ├── auth/
│   │   ├── blob/
│   │   ├── notifications/
│   │   └── observability/
│   │
│   └── api/
│       ├── v1/               # Web/Mobile 공용 공개 계약
│       └── internal/         # health/cron 등 운영 전용
│
└── docs/
```

## 3. 계층별 책임

### Client / Adapter

Web page, Web Server Action, API route, React Native 화면은 입력과 출력을 변환하는 adapter다.

Web Server Action은 다음 역할까지만 담당한다.

1. Web 입력(FormData 등)을 contract 입력으로 변환
2. Web session에서 Principal 생성
3. Application Service 호출
4. `revalidatePath` / redirect처럼 Web 전용 후처리

Server Action 안에서 핵심 정책을 새로 만들거나 UI에서 DB를 직접 읽고 쓰지 않는다.

### Application Service

HRA의 기능 동작을 표현한다.

예:

```ts
finalizeSubmission({
  actor,
  assignmentId,
  uploadIntentId,
  requestId,
})
```

동일 service를 Web Server Action과 `/api/v1` route가 함께 호출한다. HTTP self-call을 통해 Web이 자기 API를 호출하도록 강제하지 않는다.

### Repository

PostgreSQL/Drizzle 접근을 소유한다.

- Page/API가 직접 Drizzle row를 contract로 반환하지 않는다.
- DB row와 API DTO는 mapping한다.
- transaction, lock, SQL function, UNIQUE/FK/CHECK 등 현재 검증된 DB 안전장치는 repository/infrastructure 아래에서 유지한다.

### Infrastructure

DB, Auth.js, Vercel Blob, Push provider 등 외부 구현 세부사항을 캡슐화한다. 도메인 서비스가 특정 provider SDK에 직접 묶이지 않게 한다.

## 4. API-first 원칙

모바일은 Next.js Server Action이나 DB schema를 알지 않는다. 공용 계약은 `/api/v1`과 OpenAPI가 정본이다.

초기 MVP 계약:

```text
GET    /api/v1/me
GET    /api/v1/notices
GET    /api/v1/notices/{id}
GET    /api/v1/schedule
GET    /api/v1/resources
GET    /api/v1/resources/{id}
GET    /api/v1/me/assignments
GET    /api/v1/me/assignments/{id}
POST   /api/v1/.../uploads/intents
POST   /api/v1/.../uploads/{id}/verify
POST   /api/v1/.../submissions
```

health/cron/운영 API는 `/api/internal` 계열로 분리한다.

### API와 DB 모델 분리

DB의 내부 상태를 그대로 반환하지 않는다.

```text
Database Row
     ↓ mapping
Application / API DTO
     ↓
Web / Android / iOS
```

### 오류 계약

클라이언트는 한국어 문구를 파싱하지 않는다.

```json
{
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "로그인이 필요합니다.",
    "requestId": "..."
  }
}
```

error code, HTTP status, retry 가능 여부를 contract test로 고정한다.

## 5. 인증·인가

Web과 Mobile의 세션 방식은 달라도 authorization은 같아야 한다.

```text
Auth.js Cookie ─┐
                ├─> Principal ─> Authorization / Service
Mobile Bearer ──┘
```

서버가 사용하는 공통 주체는 대략 다음 정보를 가진다.

```ts
type Principal = {
  userId: string;
  role: UserRole;
  sessionVersion: number;
};
```

Web은 Auth.js cookie를 유지할 수 있다. Mobile은 short-lived access token + rotating refresh token을 사용한다. refresh token 원문은 서버 DB에 저장하지 않고 hash, 만료, 회전, revoke 상태를 관리한다.

사용자 삭제·role/sessionVersion 변경은 Web/Mobile 세션 모두에 동일한 무효화 정책을 적용한다.

Google/Kakao identity는 이메일과 동일시하지 않고 `provider + providerAccountId` 바인딩을 유지한다. iOS 출시를 위해 Apple identity 확장이 가능한 구조를 처음부터 보존한다.

## 6. React Native 공유 범위

Android와 iOS는 `apps/mobile` 하나를 사용한다. 가능한 모든 feature/network/domain 코드는 공통이다.

공유 권장:

- API contracts와 generated client
- error code
- pure validation
- 날짜/상수/pure utility
- design token

억지로 공유하지 않는 것:

- Next.js UI component
- React Native component 구현
- navigation 구현
- browser cookie / iOS Keychain / Android secure storage 세부 구현

필요한 경우에만 `.android.ts`, `.ios.ts`를 사용한다.

## 7. 파일/Blob

Private Blob server token은 Web 브라우저나 모바일 앱에 노출하지 않는다.

기존 학사 제출의 안전한 흐름을 유지한다.

```text
업로드 의도 발급
    ↓
서버 권한/대상 확인
    ↓
제한된 client upload grant
    ↓
실물 검증(MIME/size/signature/hash)
    ↓
최종 제출
```

Android/iOS는 TypeScript Vercel client 구현을 그대로 재사용할 수 없으므로 HTTP upload contract/adapter를 둔다. 서버의 검증·원자성 정책은 바꾸지 않는다.

## 8. Push와 Device

Android 먼저 출시하더라도 Android 전용 DB 모델을 만들지 않는다.

```text
device_installations
- id
- user_id
- platform: ANDROID | IOS
- push_token
- app_version
- last_seen_at
- revoked_at
```

NotificationService는 FCM/APNs/Expo provider와 application event를 분리한다. 핵심 transaction 성공이 push 성공에 의존하지 않는다.

## 9. 테스트 전략

중심은 Application Service + 실제 PostgreSQL integration test다.

```text
Unit            → pure domain/validation
Integration     → Service + isolated PostgreSQL
Contract        → OpenAPI/API v1
Web E2E         → Next.js
Mobile E2E      → Android/iOS
```

기존 auth/DB race/private upload/route audit 테스트는 구조 변경 과정에서도 삭제하거나 완화하지 않는다.

## 10. 환경 및 배포 경계

환경 분리는 [환경 분리 및 배포 전략](environment-strategy.md)을 정본으로 한다.

기본은 **Local Development → PR Preview/Test → Production**이며, 고정 Staging은 Android/iOS 내부 배포나 반복 pre-production 검수가 실제로 필요해질 때만 추가한다.

- Preview는 Production DB/Blob/PII를 사용하지 않는다.
- DB migration은 Vercel build와 분리한다.
- monorepo 전환 뒤 `apps/web`은 Vercel, `apps/mobile`은 Expo EAS가 담당한다.
- Web/Android/iOS release는 서로 독립적으로 실행·롤백 가능해야 한다.

## 11. CI 목표

monorepo PR 하나에서 가능한 범위로 다음을 검증한다.

```text
lint / typecheck
server unit + PostgreSQL integration
API contract/OpenAPI check
web build + web E2E
mobile typecheck
Android build
iOS compile/build check
```

Android를 먼저 출시해도 iOS 코드가 장기간 깨진 상태로 방치되지 않게 한다.

## 11. 의도적으로 하지 않는 것

- Microservice 선도입
- Web UI와 React Native UI 강제 공유
- DB row를 그대로 API 모델로 사용
- Android 전용 auth/API/device 구조
- iOS 별도 재작성
- 기존 검증된 학사 보안 경계를 구조 개편 편의를 위해 완화

## 12. 추적

전체 전환 순서와 출시 게이트는 #277 및 [플랫폼 전환 로드맵](../PLATFORM-ROADMAP.md)을 따른다.
