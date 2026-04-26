# 변경 이력 (CHANGELOG)

이 문서는 HRA 웹사이트의 주요 변경 사항을 기록합니다.

---

## 2026-04-26

### PR #36 — 카카오 로그인 이메일 미제공 대응 (`fix/kakao-login-no-email`)
- **문제**: 카카오 OAuth는 비즈앱 심사 없이 이메일을 제공하지 않아 `signIn` 콜백에서 `return false` → Access Denied
- **수정**: `src/lib/auth.ts` — 이메일이 없는 경우 `{provider}_{providerAccountId}@oauth.placeholder` 형태의 placeholder 이메일 생성
- **스키마 변경 없음**: 기존 `email NOT NULL UNIQUE` 제약 유지
- **머지 완료**: 2026-04-26

### PR #35 — 언론보도 페이지 게시판 형태 전환 (`feat/press-board-layout`)
- **변경**: `src/app/(public)/press/page.tsx` — 카드형 레이아웃을 4열 게시판(번호·제목·매체·날짜) 테이블로 전환
- **디자인**: 데스크톱 `md:grid-cols-[80px_1fr_180px_140px]`, 모바일 제목 + "매체 · 날짜" 한 줄
- **호버**: 행 `bg-[#F5F5F5]`, 제목 `text-[#2563EB]`
- **번호 체계**: `totalCount - index` (최신 기사 = 가장 큰 번호)
- **제거**: `Image`, `ExternalLink` import (게시판에서 불필요)
- **머지 완료**: 2026-04-26

### PR #34 — 카카오 로그인 우선 배치 (`feat(auth)`)
- **변경**: `src/app/(auth)/login/login-form.tsx` — 카카오 로그인 버튼을 최상단에 배치, 구글 로그인 아래로 이동
- **머지 완료**: 2026-04-26

### PR #33 — 카카오 콘솔 2025 개편 반영 가이드 (`docs`)
- **신규 문서**: `docs/KAKAO-LOGIN-SETUP.md` — 카카오 개발자 콘솔 2025 개편(Redirect URI, Client Secret 위치 변경)을 반영한 9단계 설정 가이드
- **Playwright 검증**: 실제 콘솔 화면을 브라우저 자동화로 확인하여 위치 확정
- **머지 완료**: 2026-04-26

### PR #32 — 홈 하단 CTA 섹션 제거 (`chore(home)`)
- **변경**: `src/app/(public)/page.tsx` — "지원하기" CTA 섹션 제거 (사용자 요청)
- **머지 완료**: 2026-04-26

### HRA 관련 언론 기사 전수 검색 완료
- **방법**: Exa websearch 10건+ 병렬 실행, librarian 에이전트 3건 가동
- **검증 기준**: "위즈덤시티", "제주대학교", "Human Renaissance Academy", "HRA", "취업역량강화 아카데미" 키워드 매칭
- **결과**: 4건 확정 (상세 → `docs/PRESS-ARTICLES.md`)

### 카카오 로그인 설정 완료
- 카카오 콘솔 앱 OAuth Redirect URI 2개 등록 (프로덕션 + localhost)
- Vercel 환경변수(`AUTH_KAKAO_ID`, `AUTH_KAKAO_SECRET`) 등록 + Redeploy 완료
- 프로덕션 로그인 테스트 통과 (Playwright 자동 검증)

---

## 2026-04-25 이전

### 보고서 시스템 구축
- 보고서 양식·가이드 관리자 CRUD 페이지 (`feat(admin)`)
- 회원 보고서 양식·가이드 열람 + PDF 저장 기능 (`feat(member)`)
- Markdown 렌더링(rehype-raw) 및 양식 통합 리졸버 (`feat(markdown)`)
- 양식 삭제를 비공개 전환(soft-delete)으로 변경 (`fix`)
- 보고서 저장 방식·라우팅·품질 게이트 문서화 (`docs`)

### 보안 패치
- `/member/*` 경로 인증 보호 추가 (`fix(security)`)
- 보호 경로 회귀 점검 항목 문서화 (`docs`)

### 인프라
- `test-results`를 `.gitignore`에 추가
- 한국어 맞춤법 검사 스크립트 추가
