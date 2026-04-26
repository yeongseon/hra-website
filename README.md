# HRA (Human Renaissance Academy) 프로젝트 가이드

대학 연합 교육 프로그램 **HRA (Human Renaissance Academy)**의 공식 웹사이트 프로젝트입니다. 이 가이드는 개발이 처음인 대학생분들도 쉽게 프로젝트를 이해하고, 본인의 컴퓨터에서 실행하며, 실제 인터넷에 배포까지 할 수 있도록 구성되었습니다.

- **실제 서비스 주소**: [https://hra-website-theta.vercel.app](https://hra-website-theta.vercel.app)
- **GitHub 저장소**: [https://github.com/yeongseon/hra-website.git](https://github.com/yeongseon/hra-website.git)

---

## 1. 프로젝트 소개
HRA 웹사이트는 교육 프로그램의 정보를 공유하고, 회원들이 자료를 열람하거나 관리자가 학사 일정을 관리할 수 있는 통합 플랫폼입니다.
누구나 접속해서 프로그램 소개를 볼 수 있고, 회원가입 후에는 자료실 등 전용 기능을 사용할 수 있습니다. 관리자는 모든 콘텐츠(공지사항, 갤러리, 교수진, 기수 등)를 관리자 페이지에서 직접 CRUD 할 수 있습니다.

---

## 2. 기술 스택

*   **Next.js 16** (App Router) + **React 19** + **TypeScript**
*   **Tailwind CSS v4** (`@import "tailwindcss"`, `tailwind.config.js` 없음)
*   **shadcn/ui v4** (`src/components/ui/`)
*   **Drizzle ORM** + **Neon Postgres** — `src/lib/db/schema.ts`에 모든 테이블 정의
*   **NextAuth v5 beta** — 아이디/비밀번호(Credentials) + 구글/카카오 소셜 로그인
*   **Vercel Blob** — 이미지/파일 업로드 저장소
*   **Zod v4** — `import { z } from "zod/v4"` (NOT `"zod"`)

---

## 3. 폴더 구조

```text
src/
├── app/
│   ├── (public)/         # 누구나: 홈, 소개, 커리큘럼, 교수진, 기수, 모집, 공지, 언론보도, 갤러리, 수료생, FAQ
│   ├── (auth)/login/     # 로그인 페이지
│   ├── (admin)/admin/    # 관리자 전용 (대시보드, 모든 콘텐츠 CRUD)
│   └── (member)/         # 로그인 필요: 자료실, 마이페이지
├── features/             # 비즈니스 로직 (서버 액션 — CRUD)
│   ├── alumni/actions/
│   ├── faculty/actions/
│   ├── gallery/actions/
│   ├── notices/actions/
│   ├── press/actions/
│   ├── recruitment/actions/
│   ├── applications/actions/
│   ├── guidebooks/actions/
│   └── weekly-texts/actions/
├── lib/
│   ├── db/schema.ts      # Drizzle 스키마 (모든 테이블)
│   ├── db/index.ts       # DB 연결
│   ├── admin.ts          # requireAdmin() — 관리자 권한 확인
│   ├── auth.ts           # NextAuth 설정
│   ├── google-sheets.ts  # 구글 시트 (지원서 조회 — 선택)
│   └── utils.ts
├── components/
│   ├── ui/               # shadcn/ui
│   ├── layout/           # header, footer
│   └── admin/            # 관리자 전용 컴포넌트
└── scripts/              # 관리 스크립트 (관리자 시딩, 맞춤법 검사)
```

---

## 4. 사이트 구조 및 이용 권한

| 영역 | 접근 권한 | 페이지 |
| --- | --- | --- |
| 공개 | 누구나 | 홈, 소개, 커리큘럼, 교수진, 기수, 모집, 공지사항, 언론보도, 갤러리, 수료생 이야기, FAQ |
| 회원 | 로그인 필요 | 자료실, 마이페이지 |
| 관리자 | 관리자 권한 필요 | `/admin` 이하 전부 (대시보드, 콘텐츠 관리, 회원 관리) |

---

## 5. 데이터 저장 아키텍처

> **원칙: 텍스트/메타데이터는 DB, 이미지/파일만 Vercel Blob**

| 콘텐츠 | 저장 방식 | 비고 |
| --- | --- | --- |
| 교수진, 기수, 모집 설정 | **Neon Postgres** (DB) | |
| 공지사항 (Markdown 본문) | **Neon Postgres** (DB) | `text` 컬럼 |
| 언론보도 | **Neon Postgres** (DB) | |
| 갤러리 메타 | **Neon Postgres** (DB) | 이미지 URL은 Blob |
| 수료생 이야기, FAQ, 자료실 메타 | **Neon Postgres** (DB) | |
| 지원서, 회원 | **Neon Postgres** (DB) | |
| 갤러리 이미지, 자료실 파일, 교수진 사진 | **Vercel Blob** | 업로드 시 MIME/크기 검증 |
| 지원서(외부 폼 연동 시) | **Google Sheets** | `GOOGLE_SHEETS_API_KEY` 설정 시 관리자 페이지에서 조회 |

---

## 6. 환경변수

`.env` 파일에 필요한 설정값입니다.

### 필수 항목

| 키 | 설명 |
| --- | --- |
| `DATABASE_URL` | Neon Postgres 연결 주소 |
| `AUTH_SECRET` | NextAuth 보안 키 (`npx auth secret`로 생성) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob 토큰 |
| `NEXT_PUBLIC_APP_URL` | 사이트 주소 (로컬: `http://localhost:3000`) |

### 선택 항목

| 키 | 설명 |
| --- | --- |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | 구글 로그인 (없으면 버튼 자동 숨김) |
| `AUTH_KAKAO_ID` / `AUTH_KAKAO_SECRET` | 카카오 로그인 (없으면 버튼 자동 숨김) |
| `GOOGLE_SHEETS_API_KEY` | 관리자 페이지에서 외부 구글폼 지원서 조회 |

> 👉 각 항목의 발급 방법은 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)를 참고하세요.

---

## 7. 주요 명령어

| 명령어 | 설명 |
| --- | --- |
| `npm install` | 의존성 설치 |
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 프로덕션 빌드 |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run test:e2e` | Playwright E2E |
| `npx drizzle-kit push` | DB 스키마 반영 |
| `npm run seed-admin` | 초기 관리자 계정 생성 (`ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run seed-admin`) |
| `npm run spell-check` | 한국어 맞춤법 검사 |

---

## 8. 시작하기 (로컬 실행)

1. **Node.js 18+** 설치
2. `npm install`
3. `.env.example`을 복사해 `.env` 작성 → 필수 항목 채우기
4. `npx drizzle-kit push` — DB 스키마 반영
5. `npm run seed-admin` — 첫 관리자 계정 생성
6. `npm run dev` → http://localhost:3000

---

## 9. 핵심 패턴 (코드 작성 시 참고)

### 서버 액션 패턴 (`src/features/*/actions/index.ts`)

```typescript
"use server";

import { z } from "zod/v4";              // ← zod/v4 필수
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

// 1. Zod 스키마 검증 → 2. requireAdmin() → 3. DB CRUD → 4. revalidatePath() → 5. redirect()
```

### 권한 관리

- 미들웨어(`src/proxy.ts`) + `requireAdmin()` 조합
- 비로그인 사용자가 회원 전용 페이지 접근 시 자동으로 로그인 페이지로 이동
- 관리자가 아닌 사용자가 `/admin/*` 접근 시 차단

### 디자인 토큰

- 텍스트: `text-[#1a1a1a]` (주), `text-[#666666]` (보조)
- 테두리: `border-[#D9D9D9]`
- 브랜드 블루: `text-[#2563EB]`, `bg-[#2563EB]`
- 관리자 버튼: `bg-[#1a1a1a] text-white hover:bg-[#333333]`

> 더 자세한 규칙은 [AGENTS.md](AGENTS.md)를 참고하세요.

---

## 10. 배포

- **프로덕션**: Vercel (`https://hra-website-theta.vercel.app`)
- **개발 문서**: MkDocs GitHub Pages (`https://yeongseon.github.io/hra-website/`)
- **DB 마이그레이션**: `npx drizzle-kit push`
- **변경 후 반드시**: `npm run build`로 빌드 확인

궁금한 점이 있다면 언제든 프로젝트 관리자에게 문의하세요!
