# HRA (Human Renaissance Academy) 프로젝트 가이드

대학 연합 교육 프로그램 **HRA (Human Renaissance Academy)**의 공식 웹사이트 프로젝트입니다. 이 가이드는 개발이 처음인 대학생분들도 쉽게 프로젝트를 이해하고, 본인의 컴퓨터에서 실행하며, 실제 인터넷에 배포까지 할 수 있도록 구성되었습니다.

- **실제 서비스 주소**: [https://hra-website-theta.vercel.app](https://hra-website-theta.vercel.app)
- **GitHub 저장소**: [https://github.com/yeongseon/hra-website.git](https://github.com/yeongseon/hra-website.git)

---

## 1. 프로젝트 소개
HRA 웹사이트는 교육 프로그램의 정보를 공유하고, 회원들이 자료를 열람하거나 관리자가 학사 일정을 관리할 수 있는 하이브리드 플랫폼입니다. 
누구나 접속해서 프로그램 소개를 볼 수 있고, 회원가입 후에는 자료실 등 전용 기능을 사용할 수 있습니다.

---

## 2. 기술 스택
이 프로젝트는 최신 웹 개발 도구들을 사용합니다. 각 도구가 어떤 역할을 하는지 간단히 알아볼까요?

*   **Next.js 16**: React를 기반으로 웹사이트의 앞면(UI)과 뒷면(서버)을 모두 만들 수 있게 해주는 도구입니다.
*   **React 19**: 사용자 화면(UI)을 만들기 위한 가장 인기 있는 라이브러리입니다.
*   **TypeScript**: 자바스크립트에 '타입'이라는 규칙을 추가해 코딩 실수를 줄여주는 언어입니다.
*   **Tailwind CSS v4**: 미리 정해진 이름을 사용해 디자인을 쉽고 빠르게 입힐 수 있는 스타일링 도구입니다.
*   **shadcn/ui v4**: 버튼, 입력창 등 이미 잘 만들어진 디자인 부품들을 가져와 쓸 수 있는 라이브러리입니다.
*   **Drizzle ORM**: 복잡한 데이터베이스 언어 대신 자바스크립트 코드로 데이터를 쉽게 다룰 수 있게 돕는 도구입니다.
*   **Neon Postgres**: 데이터를 저장하는 창고(데이터베이스)로, 서버 없이도 빠르게 시작할 수 있습니다.
*   **NextAuth v5 beta**: 구글 로그인이나 아이디/비밀번호 로그인을 안전하게 구현해주는 인증 도구입니다.
*   **Vercel Blob**: 사용자가 올린 이미지나 파일을 저장하는 온라인 저장소입니다.

---

## 3. 폴더 구조
프로젝트 내의 폴더들은 각각 정해진 역할이 있습니다.

```text
src/
├── app/
│   ├── (public)/         # 누구나: 홈, 소개, 교수진, 커리큘럼, 기수, 모집, 공지, 갤러리
│   ├── (auth)/           # 로그인 페이지
│   │   └── login/
│   │       ├── page.tsx       # 서버 컴포넌트 (프로바이더 정보 전달)
│   │       └── login-form.tsx # 클라이언트 컴포넌트 (실제 로그인 UI)
│   ├── (admin)/          # 관리자 전용 (대시보드, 공지, 자료실, 회원 관리 등)
│   └── (member)/         # 로그인 필요: 자료실, 마이페이지
├── features/             # 비즈니스 로직 (서버 액션)
├── lib/                  # 공통 도구 (인증, DB, GitHub CMS, 구글시트 등)
├── components/           # 재사용 UI 부품
└── scripts/              # 관리 스크립트 (맞춤법 검사, 관리자 생성 등)
content/                  # GitHub CMS 콘텐츠 (공지사항 md, 갤러리 json)
```

---

## 4. 사이트 구조 및 이용 권한
HRA 웹사이트는 각 페이지마다 이용 권한이 다릅니다.

*   **공개 페이지 (누구나)**: 메인, 소개, 교수진, 커리큘럼, 기수, 모집, 공지, 갤러리
*   **로그인 필요 페이지 (회원 전용)**: 자료실, 마이페이지
*   **관리자 전용 페이지**: 관리자 대시보드 및 모든 관리 기능 (`/admin`)

> **참고**: 자료실에는 기존의 수업일지 기능이 통합되어 있습니다.

---

## 5. 하이브리드 CMS 아키텍처
이 프로젝트는 관리의 편의성과 성능을 위해 두 가지 방식의 저장소를 함께 사용합니다.

*   **GitHub CMS**: 공지사항(Markdown)과 갤러리 메타 정보(JSON)는 `content/` 폴더에서 관리됩니다. 관리자 화면에서 수정하면 GitHub API를 통해 코드가 직접 업데이트됩니다.
*   **Vercel Blob**: 갤러리 이미지와 같은 미디어 파일은 Vercel의 클라우드 저장소에 저장됩니다.
*   **데이터베이스 (Neon)**: 자료실 게시물, 사용자 정보, 인증 데이터는 관계형 데이터베이스에 저장됩니다.
*   **Google Sheets**: 지원서 데이터는 Google Forms를 통해 입력받으며, Google Sheets API를 통해 관리자 화면에서 조회합니다.

---

## 6. 환경변수 설명
`.env` 파일에 필요한 설정값들입니다. 필수 항목이 채워지지 않으면 사이트가 정상 작동하지 않을 수 있습니다.

### 필수 항목 (Required)
*   **DATABASE_URL**: Neon Postgres 데이터베이스 연결 주소
*   **AUTH_SECRET**: 인증 보안을 위한 랜덤 문자열 (`npx auth secret`으로 생성)
*   **BLOB_READ_WRITE_TOKEN**: Vercel Blob 저장소 접근 토큰
*   **NEXT_PUBLIC_APP_URL**: 사이트 주소 (로컬: `http://localhost:3000`)

### 선택 항목 (Optional)
*   **소셜 로그인**: `AUTH_GOOGLE_ID/SECRET`, `AUTH_KAKAO_ID/SECRET`. 설정하지 않으면 로그인 화면에서 해당 버튼이 자동으로 숨겨지며 아이디/비밀번호 로그인만 활성화됩니다.
*   **GitHub CMS**: `GITHUB_TOKEN`, `GITHUB_REPO`. 공지사항이나 갤러리를 관리자 UI에서 직접 수정하려면 필요합니다.
*   **지원서 조회**: `GOOGLE_SHEETS_API_KEY`. 관리자 화면에서 지원 현황을 확인하려면 필요합니다.

> 👉 각 항목의 **발급 방법과 상세 설정 단계**는 [배포 가이드 (docs/DEPLOYMENT.md)](docs/DEPLOYMENT.md)를 참고하세요.

---

## 7. 주요 명령어
터미널에서 자주 사용하게 될 명령어들입니다.

*   `npm install`: 필요한 라이브러리 설치
*   `npm run dev`: 개발 모드로 사이트 실행
*   `npm run build`: 서비스 배포용 빌드
*   `npx drizzle-kit push`: 데이터베이스 구조 반영
*   `npm run seed-admin`: 초기 관리자 계정 생성
    *   사용법: `ADMIN_EMAIL="이메일" ADMIN_PASSWORD="비번" npm run seed-admin`
*   `npm run spell-check`: 한국어 맞춤법 검사
*   `npm run spell-fix`: 맞춤법 자동 교정

---

## 8. 시작하기 (로컬 실행)
1.  **Node.js 설치**: 18 버전 이상을 설치하세요.
2.  **설치**: `npm install`
3.  **환경변수**: `.env.example`을 복사해 `.env`를 만들고 필수 항목을 채웁니다.
4.  **DB 초기화**: `npx drizzle-kit push`
5.  **관리자 생성**: `npm run seed-admin`으로 첫 관리자 계정을 만듭니다.
6.  **실행**: `npm run dev` 후 `localhost:3000` 접속

---

## 9. 프로젝트 구조 이해하기 (팁)
*   **하이브리드 인증**: 기본적으로 아이디/비밀번호(Credentials) 로그인을 지원하며, 환경변수 설정에 따라 구글/카카오 로그인이 유연하게 활성화됩니다.
*   **권한 관리**: `middleware.ts`에서 페이지별 접근 권한을 관리합니다. 비로그인 사용자가 회원 전용 페이지에 접근하면 로그인 페이지로 자동 이동합니다.
*   **서버/클라이언트 분리**: 보안이 중요한 로직은 `features/` 폴더의 서버 액션에서 처리하며, 화면 인터랙션은 `'use client'` 컴포넌트에서 담당합니다.

궁금한 점이 있다면 언제든 프로젝트 관리자에게 문의하세요!
