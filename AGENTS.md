<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# HRA Website — Agent Rules

## 1. 언어 규칙

이 사이트는 **한글(Korean)** 사이트입니다.

- `<html lang="ko">` 설정 완료
- 영어 UI 텍스트 사용 금지 — 사용자에게 보이는 모든 문자열은 한국어
- 코드 주석은 **한국어**로 자세히 작성 (기존 파일 스타일 참고: `admin-shell.tsx`, `schema.ts`)
- 변수명, 파일명, 함수명은 영어 유지

## 2. 기술 스택

- **Next.js 16** + **React 19** + **TypeScript**
- **Tailwind CSS v4** (NOT v3 — `@import "tailwindcss"` 사용, `tailwind.config.js` 없음)
- **shadcn/ui v4** — `@/components/ui/`
- **Drizzle ORM** + **Neon Postgres** — `src/lib/db/schema.ts`
- **NextAuth v5 beta** — credentials + 소셜 로그인
- **Vercel Blob** — 이미지/파일 업로드 (`import { del, put } from "@vercel/blob"`)
- **Zod v4** — `import { z } from "zod/v4"` (NOT `"zod"`)

## 3. 프로젝트 구조

```
src/
├── app/
│   ├── (public)/         # 공개 페이지 (소개, 커리큘럼, 교수진, 기수, 모집, 공지, 언론보도, 갤러리, 수료생, FAQ, 자료실)
│   ├── (auth)/           # 로그인 페이지
│   ├── (admin)/admin/    # 관리자 전용 (CRUD 관리)
│   └── (member)/         # 로그인 필요 (자료실, 마이페이지)
├── features/             # 비즈니스 로직 — 서버 액션 (CRUD)
│   ├── alumni/actions/
│   ├── faculty/actions/
│   ├── gallery/actions/
│   ├── notices/actions/
│   ├── press/actions/
│   ├── recruitment/actions/
│   └── ...
├── lib/
│   ├── db/schema.ts      # Drizzle 스키마 (모든 테이블 정의)
│   ├── db/index.ts       # DB 연결
│   ├── admin.ts          # requireAdmin() — 관리자 권한 확인
│   └── utils.ts          # cn() 등 유틸리티
├── components/
│   ├── ui/               # shadcn/ui 컴포넌트
│   ├── layout/           # header.tsx, footer.tsx
│   └── admin/            # 관리자 전용 컴포넌트
```

## 4. 데이터 저장 방식

**원칙: "관리자 페이지에서 CRUD하는 텍스트/메타는 DB, 이미지만 Blob"**

| 콘텐츠 | 저장 방식 | 비고 |
|--------|----------|------|
| 교수진, 기수, 모집설정 | DB (Neon Postgres) | |
| 공지사항 | DB | Markdown 본문은 text 컬럼 |
| 언론보도 | DB | |
| 갤러리 메타 | DB | 이미지는 Vercel Blob |
| 수료생 이야기 | DB | |
| FAQ 연락처 | DB | |
| 자료실 | DB | 파일은 Vercel Blob |
| 지원서, 회원 | DB | |

## 5. 코딩 패턴

### 서버 액션 패턴 (`src/features/*/actions/index.ts`)
```typescript
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";              // ← zod/v4 필수
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { 테이블 } from "@/lib/db/schema";

// 1. Zod 스키마로 validation
// 2. requireAdmin()으로 권한 확인
// 3. DB CRUD
// 4. revalidatePath()로 캐시 무효화
// 5. redirect()로 목록 페이지 이동
```

### 공개 페이지 패턴
```typescript
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";  // DB 기반 페이지 필수
export const metadata: Metadata = { title: "페이지명" };
```

### 관리자 페이지 패턴
```
src/app/(admin)/admin/[feature]/
├── page.tsx              # 목록 (Table + 삭제/편집 버튼)
├── new/page.tsx          # 생성 (Form 컴포넌트 사용)
├── [id]/page.tsx         # 편집 (Form 컴포넌트 + defaultValues)
└── _components/
    └── [feature]-form.tsx  # "use client" 폼 (useActionState)
```

### 디자인 토큰
- 텍스트: `text-[#1a1a1a]` (주), `text-[#666666]` (보조)
- 테두리: `border-[#D9D9D9]`
- 그림자: `shadow-[var(--shadow-soft)]`
- 브랜드 블루: `text-[#2563EB]`, `bg-[#2563EB]`
- 관리자 버튼: `bg-[#1a1a1a] text-white hover:bg-[#333333]`

## 6. 네비게이션 구조

### 공개 헤더 (드롭다운)
```
소개(HRA/커리큘럼/교수진/기수) → 모집안내 → 소식(공지사항/언론보도/갤러리) → 커뮤니티(수료생이야기/FAQ) → 자료실
```

### 관리자 사이드바 (공개 메뉴 순서 반영)
```
대시보드 → 교수진 → 기수관리 → 모집설정 → 공지사항 → 언론보도 → 갤러리 → 수료생이야기 → FAQ연락처 → 자료실 → 지원서 → 회원관리
```

## 7. 금지 사항

- `as any`, `@ts-ignore`, `@ts-expect-error` 사용 금지
- 빈 catch 블록 `catch(e) {}` 금지
- `import { z } from "zod"` 금지 — 반드시 `"zod/v4"` 사용
- 영어 UI 텍스트 금지
- `content/` 폴더의 파일 기반 CMS는 더 이상 사용하지 않음 — 모든 콘텐츠는 DB 기반

## 8. 문서화 규칙

모든 코드에 **한국어 주석**을 자세히 작성합니다:
- 파일 상단: 파일 설명 블록 주석 (역할, 사용 위치, 주요 기능)
- 주요 함수/변수: 한 줄 주석
- 복잡한 로직: 단계별 설명 주석
- 참고 파일: `src/app/(admin)/admin/admin-shell.tsx`, `src/lib/db/schema.ts`

## 9. 테스트 전략

- **프레임워크**: Vitest + Playwright
- **우선순위**: Integration (서버 액션) > E2E (핵심 플로우 5~7개) > Unit (순수 함수)
- **DB**: mock 대신 별도 test DB 사용
- **Blob**: 대부분 mock, 실제 업로드 E2E 1개
- **CI**: `lint → typecheck → vitest → playwright(smoke)`

## 10. 배포

- **프로덕션**: Vercel (`https://hra-website-theta.vercel.app`)
- **문서**: MkDocs GitHub Pages (`https://yeongseon.github.io/hra-website/`)
- **DB 마이그레이션**: `npx drizzle-kit push`
- **빌드 확인**: `npm run build` (변경 후 반드시 실행)
