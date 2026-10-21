# HRA 환경 분리 및 배포 전략

> 상태: 운영 전 목표 정책. 전체 배포 추적은 #284, 환경 분리는 #279를 따른다. 이 문서에 적힌 환경·자동화가 모두 구축됐다는 뜻은 아니다.

HRA는 예상 사용자 약 1~200명 규모를 기준으로 **환경은 분리하고 인프라는 단순하게** 유지한다. 여기서 환경은 코드가 실행되는 장소와 그 장소에서 사용하는 DB·파일·로그인 설정의 묶음이다. 사용자 수가 적어도 실제 자료와 개발 테스트는 구분한다. 별도 Dev/QA/Staging 서버를 모두 상시 운영하지는 않는다.

처음 배포하는 개발자는 [배포 안내](../DEPLOYMENT.md)에서 현재 실행 절차를 보고, 이 문서에서 앞으로의 구성 원칙을 확인한다. 브랜치·Preview·migration·secret 같은 용어는 [용어집](../getting-started/glossary.md)에 있다.

## 현재 상태와 목표 구분

| 항목 | 현재 코드·문서에서 확인할 수 있는 상태 | 목표·추적 |
| --- | --- | --- |
| 앱 구조 | 저장소 루트의 `package.json`과 `src/` | 웹·모바일 monorepo 전환은 [플랫폼 아키텍처](platform-architecture.md) |
| 앱 DB 연결 | `src/lib/db/index.ts`의 Neon HTTP 드라이버 | 환경별 개발·검증·운영 DB 분리는 #279 |
| DB 변경 | 범위별 SQL·스크립트와 수동 적용 절차 | 적용 이력·Production migration gate는 #280 |
| 파일 저장소 | 공개·보호 자료·학사 제출의 설정이 구분됨 | 실제 저장소·토큰의 환경 분리는 #279에서 확인 |
| 예약 작업 | `vercel.json`에 요청 제한 정리 일정 한 개 | 다른 정리 일정은 개별 runbook과 운영 결정 후 등록 |

실제 Vercel·Neon·Blob의 연결 현황은 담당자가 환경별로 확인해야 한다. 저장소의 설정 이름과 문서만으로 운영·Preview가 이미 분리됐다고 판단하지 않는다.

## 1. 기본 환경

기본은 다음 세 단계다. 개발자가 작업 브랜치를 PR로 제출하면 Preview에서 함께 검증하고, 리뷰와 필요한 DB 적용을 거쳐 Production에 반영하는 것을 목표로 한다.

| 환경 | 목적 | 목표 DB·파일·로그인 설정 |
| --- | --- | --- |
| Local Development | 개발자 PC에서 수정·확인 | 개인 Neon 개발 branch, 개발용 OAuth·Blob. 로컬 PostgreSQL은 지원되는 격리 테스트에 사용 |
| PR Preview / Test | PR의 변경을 공동 확인 | PR별 격리 Neon branch, Test Blob·Private Blob, 합성 또는 승인된 비식별 데이터 |
| Production | 실제 사용자에게 서비스 | Production Neon·Blob·Private Blob·로그인 설정, 실제 사용자 데이터 |

Preview가 생겼다는 사실만으로 DB도 PR별로 생성·격리되는 것은 아니다. 그 연결과 정리 자동화까지 #279의 완료 조건에 포함한다.

## 2. Staging을 추가하는 조건

Staging은 운영 전 검수를 위한 **고정된 검증 주소**를 가진 환경이다. 처음부터 상시 운영하지 않고 다음 중 하나가 필요할 때 추가한다.

- Google Play Internal Testing 또는 TestFlight가 안정적으로 참조할 고정 API URL
- 모바일 로그인 후 돌아오는 callback·deep link를 PR별 주소로 관리하기 어려운 경우
- 앱 스토어 출시 전에 같은 설정 조합으로 반복 검증할 환경
- 외부 기관·운영진이 함께 검수할 고정 주소

그 전에는 PR Preview/Test를 사용한다. Staging을 만들면 DB, 공개·비공개 Blob, OAuth client secret, 사용자 세션·토큰을 Production과 공유하지 않는다.

Production 데이터를 그대로 복제하지 않는다. 구조가 필요한 검증에는 **합성 데이터**(테스트용으로 만든 가짜 자료)나 승인된 **비식별 데이터**(개인을 알아볼 수 없게 처리하고 확인한 자료)를 사용한다.

## 3. 환경별 역할

| 구분 | Local Dev | Preview/Test | Staging(조건부) | Production |
| --- | --- | --- | --- | --- |
| 대상 | 개발자 | PR 검증 | 모바일·릴리스 검수 | 실제 사용자 |
| Web | localhost | Vercel Preview | 고정 검증 URL | Vercel Production |
| DB | 개인 개발 branch·지원 테스트 DB | PR별 격리 branch | 별도 staging DB | Production DB |
| Blob | 개발 저장소 | Test 저장소 | Staging 저장소 | Production 저장소 |
| OAuth | 개발 client | Preview client 또는 비활성 | Staging client | Production client |
| 개인정보 | 실제 자료 사용 금지 | 합성·승인된 비식별 자료 | 합성·승인된 비식별 자료 | 목적·권한에 맞게 사용 |
| 삭제·변경 테스트 | 격리 환경만 | 합성 fixture만 | 승인된 fixture만 | 수행하지 않음 |
| migration | 개발 검증 | 격리 검증 | 필요 시 적용 예행연습 | 대상·복구 확인과 승인 후 적용 |

## 4. 데이터베이스 원칙

### Production DB

실사용 데이터의 정본이다. 개발 편의를 위해 직접 연결하거나 PR Preview에서 사용하지 않는다. migration은 Vercel build 안에서 자동 실행하지 않는다. 기존 데이터를 삭제·변환하는 변경은 적용 범위와 백업·복구 경로를 확인한 뒤 진행한다.

### Development / Preview DB

목표 순서는 다음과 같다.

1. 개발자는 개인 Neon 개발 branch를 사용한다. 격리 SQL 테스트는 지원되는 로컬 PostgreSQL 실행기로 수행할 수 있다.
2. PR에는 고유한 Preview DB branch를 연결한다.
3. 필요한 스키마·마이그레이션을 그 Preview DB에서 재현한다.
4. PR 종료 후 검증 자료와 Preview DB를 정리한다.

**현재 구현 주의:** 앱은 Neon HTTP 드라이버를 사용한다. 일반 로컬 PostgreSQL 연결 문자열만 `DATABASE_URL`에 넣으면 앱이 바로 연결되는 구조가 아니다. 로컬 PostgreSQL 기반 HTTP 검증은 [자료 접근 실행기](../resource-file-access-policy.md)처럼 명시적인 테스트 어댑터를 사용하는 범위에서 수행한다. 드라이버·환경 지원을 바꾸려면 별도 구현과 검증이 필요하다.

실사용 이후 Production과 비슷한 데이터가 필요해도 개인 정보를 그대로 복사하지 않는다. 비식별화 절차와 확인 책임을 먼저 정한다.

## 5. Blob 및 파일 저장소

DB만 분리하고 파일 저장소를 공유하면 Preview의 작업이 운영 파일에 영향을 줄 수 있다. 각 환경에서 다음 용도를 구분한다.

| 파일 용도 | 저장소 정책 |
| --- | --- |
| 공개 콘텐츠 사진·포스터 | 그 환경의 public Blob |
| 보호 자료실 문서·첨부 | 그 환경의 resource Private Blob |
| 학사 개인 제출 파일 | 그 환경의 academic submission Private Blob |

Preview·Staging에서 Production Blob token을 사용하지 않는다. 서버의 읽기·쓰기 토큰은 브라우저에 전달하지 않으며, 정리 작업도 자기 환경의 저장소만 대상으로 한다. 개발 검증에서는 합성 파일만 만들고 지운다.

기존 보호 자료의 이전 완료 여부는 [자료실 파일 접근 정책](../resource-file-access-policy.md)에서 별도로 확인한다. 환경 분리와 파일의 공개·비공개 전환은 서로 다른 확인 항목이다.

## 6. OAuth와 인증

OAuth는 구글·카카오 같은 제공자를 통해 로그인하는 방식이다. callback은 로그인 후 앱으로 돌아올 주소다. 환경마다 올바른 주소와 client 설정을 연결한다.

| 환경 | 웹 로그인 연결 원칙 |
| --- | --- |
| Development | localhost용 callback |
| Preview/Test | 검증 전용 callback을 지원하거나 해당 제공자를 명시적으로 비활성 |
| Staging | 고정 staging callback |
| Production | production callback |

모바일을 구현할 때에도 운영 Android/iOS 앱이 Preview callback을 사용하지 않도록 한다. 내부 배포가 고정 backend 주소를 요구하면 그때 Staging을 도입한다. 웹의 Auth.js 쿠키와 모바일의 토큰 세션은 환경을 교차하지 않으며, 모바일 세션·갱신 토큰 기록도 해당 환경의 DB에 두는 것이 목표다. 모바일 인증이 현재 웹 코드에 이미 구현됐다는 뜻은 아니다.

## 7. 환경변수 정책

환경변수는 앱의 실행 설정이고, secret은 그중 DB 비밀번호·서버 토큰 같은 비밀값이다. 각 값에는 이름·목적·비밀 여부·필수 조건·적용 환경·누락 시 동작·담당 시스템을 기록한다.

예를 들어 `DATABASE_URL`은 비밀값이며 Development에는 개발 DB, Preview에는 검증 DB, Production에는 운영 DB를 지정한다. 환경을 교차해 재사용하지 않는다. `NEXT_PUBLIC_` 값은 브라우저에 전달될 수 있으므로 비밀값을 넣지 않는다.

`fail-closed`는 설정·검사가 실패하면 요청을 거부한다는 뜻이다. `fail-open`은 실패해도 허용하는 동작이다. 새 설정을 추가할 때 어느 동작인지 코드로 확인하고 `.env.example`과 [배포 문서](../DEPLOYMENT.md)를 함께 수정한다. 아직 환경별 secret 범위를 강제하는 자동 검사가 마련됐다고 가정하지 않는다.

## 8. Cron과 백그라운드 작업

Cron은 정해진 시간에 서버 작업을 호출하는 일정이다. Production Cron은 Production DB·Storage만 접근하고, Preview에서는 Production Cron secret을 사용하지 않는다. Staging 일정은 필요할 때만 별도로 켠다.

현재 요청 제한 로그 정리는 [요청 제한 운영 절차](../operations/rate-limits.md)를 따른다. 학사 업로드 정리는 [학사 업로드 runbook](academic-assignment-uploads.md)의 기능·삭제 gate와 운영 결정을 유지한다. 경로가 구현돼 있다는 이유만으로 자동 실행 일정을 추가하지 않는다.

`gate`는 기능 실행을 허용하는 조건 또는 설정 스위치다. 파일을 실제로 지우는 작업은 검사 기능의 활성화와 삭제 허용을 구분한다. [파일 원장 정리](../operations/markdown-image-ownership.md)의 쓰기 중단 확인값도 그 자체로 앱을 잠그지는 않는다.

## 9. 배포와 migration의 목표 순서

1. PR에서 코드와 DB 변경 범위를 설명한다.
2. CI·격리 DB 재적용·계약 테스트 등 해당 변경의 검증을 수행한다.
3. Preview에서 기능을 확인하고 리뷰한다.
4. 검증된 변경을 병합한다.
5. DB 변경이 있으면 Production migration gate에서 대상·적용 순서·승인·복구 조건을 확인한다.
6. 스키마·함수 검증 후 호환되는 웹 버전을 Production에 배포하거나 승격한다.

migration gate는 DB 변경이 준비되기 전에 새 앱을 배포하지 않도록 확인하는 단계다. **이 자동화는 #280의 구현 목표**이며 현재 공통 적용 이력과 자동 배포 차단이 모두 구축된 상태는 아니다. 현재 작업은 [DB 변경 절차](database-change-procedure.md)에 따른 수동 검증 기록을 남긴다.

DB 변경이 없는 작업은 해당 DB 적용 단계를 생략할 수 있다. 변경이 있다면 이전·새 앱과 DB의 호환성을 검토하고, 새 코드가 아직 설치되지 않은 함수를 먼저 호출하지 않게 적용 순서를 정한다.

## 10. 웹과 모바일 배포 분리

다음은 monorepo 전환 이후의 목표다. monorepo는 웹·모바일 코드를 한 저장소에서 관리하는 구성이며 앱 배포까지 하나로 묶는다는 뜻은 아니다.

| 대상 경로(목표) | 빌드·배포 경로(목표) |
| --- | --- |
| `apps/web` | Vercel 웹 배포 |
| `apps/mobile` Android | Expo EAS를 거쳐 Google Play |
| `apps/mobile` iOS | Expo EAS를 거쳐 App Store |

웹 배포, GitHub Release, Android 출시, iOS 출시는 각각 재실행·복구할 수 있게 설계한다. 서버의 기능을 함께 쓰더라도 각 앱의 배포 일정과 검증은 구분한다. 현재 경로와 서비스 경계의 전환 순서는 [플랫폼 아키텍처](platform-architecture.md)를 따른다.

## 11. 규모에 맞는 운영

1~200명 규모에서는 Kubernetes, 상시 QA·Dev 서버, 여러 지역의 동시 운영, 마이크로서비스, 여러 독립 DB 클러스터를 기본 요구사항으로 두지 않는다. 구체적인 운영 필요가 생기면 다시 결정한다.

환경 분리는 실제 데이터를 보호하기 위한 결정이다. 서버를 얼마나 크게 운영할지는 트래픽·사용량을 보고 정한다. 두 결정을 구분하면 테스트의 독립성을 유지하면서 불필요한 상시 비용과 운영 부담을 줄일 수 있다.

## 12. 완료 기준

#279에서는 다음 결과를 환경별로 확인한다.

- Local/Preview/Production DB가 분리됨
- Preview가 Production 개인정보·Blob에 접근하지 못함
- 환경별 secret 적용 범위와 누락 동작이 문서화됨
- migration과 Vercel build가 분리됨
- Staging 도입 조건이 문서화됨
- 모바일 내부 테스트에 필요한 시점까지 상시 Staging을 만들지 않음

**정상 결과:** Preview에서 합성 자료를 변경해도 운영 DB·파일·세션에 영향이 없고, 적용·배포 결과를 환경별로 설명할 수 있다. **대상 연결이나 분리가 불확실하면:** 담당자가 현황을 확인하고 연결 범위를 정한 뒤 해당 환경의 쓰기·정리를 시작한다.

배포 전체 추적은 #284를 따른다. 문서를 읽거나 수정한 것과 이 완료 조건을 실제로 검증한 것을 구분해 기록한다.
