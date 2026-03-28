# HRA 웹사이트 꾸미기 가이드 (커스터마이징)

> ⭐ **이 문서는 뭔가요?**
>
> 사이트의 글자, 메뉴, 색상, 레이아웃 같은 걸 바꾸고 싶을 때 보는 안내서예요.
> "어떤 파일을 열어서 어디를 고치면 되는지" 하나하나 알려드릴게요.
> 코드를 몰라도 괜찮아요. 한글 부분만 찾아서 바꾸면 대부분 돼요!

---

## 시작하기 전에 꼭 알아둘 것

- **파일 경로**: `src/app/(public)/page.tsx` 같은 건 프로젝트 폴더 안에서 파일이 어디 있는지 알려주는 주소예요.
- **수정 방법**: VS Code에서 파일을 열고 → 바꾸고 싶은 한글을 찾아서 수정 → 저장(`Ctrl + S`, Mac은 `Cmd + S`)
- ⚠️ **이것만 주의하세요**: 괄호(`{`, `}`)나 따옴표(`"`, `'`)를 실수로 지우면 사이트가 깨져요! **한글 텍스트 부분만** 바꾸세요.

---

## 1. ⭐ 홈페이지 바꾸기

📁 파일 위치: `src/app/(public)/page.tsx`

### 메인 제목 바꾸기

파일을 열고 큰 글씨(한글)를 찾아서 원하는 내용으로 바꾸세요.

```tsx
// ✏️ 바꾸기 전
<h1>인간 르네상스<br />아카데미</h1>

// ✅ 바꾼 후
<h1>새로운 미래를<br />만드는 HRA</h1>
```

> 👉 따옴표나 꺾쇠(`<h1>`, `</h1>`)는 건드리지 말고, 안에 있는 **한글만** 바꾸면 돼요!
> 👉 `<br />`은 줄바꿈이에요. 없애면 한 줄로 이어져요.

### 핵심 가치 카드 수정

"도전", "성장", "경험" 같은 카드들이 있어요. 파일에서 해당 한글을 찾아서 원하는 내용으로 바꾸세요.

### 통계 숫자 변경

`0`, `100+` 같은 숫자를 찾아서 실제 수치로 바꾸세요.

---

## 2. 소개 페이지 바꾸기

📁 파일 위치: `src/app/(public)/about/page.tsx`

- **상단 소개 문구** — 파일 위쪽에서 한글 텍스트를 찾아 수정해요
- **핵심 가치 카드** — "인문학", "기술" 같은 제목과 설명을 바꿔요
- **연혁(History)** — 새 항목을 추가하고 싶으면 기존 항목을 복사해서 내용만 바꾸면 돼요

---

## 3. 커리큘럼 페이지 바꾸기

📁 파일 위치: `src/app/(public)/curriculum/page.tsx`

학기별 과목 이름과 설명을 바꿀 수 있어요.

```tsx
// ✏️ 과목 이름 바꾸기 (한글만 수정!)
<h3>인문학 세미나</h3>  →  <h3>철학 토론</h3>

// ✏️ 시간 바꾸기
<span>주 1회, 2시간</span>  →  <span>격주, 3시간</span>
```

---

## 4. 기수 소개 페이지 바꾸기

📁 파일 위치: `src/app/(public)/cohorts/page.tsx`

기수 정보(이름, 기간, 모집 상태)를 수정해요.

### 상태 바꾸기 (예: "진행중" → "수료")

파일에서 "진행중"이라는 글자를 찾아서 "수료"로 바꾸고, 색상도 함께 바꿔주면 좋아요.

```tsx
// ✏️ "진행중"을 "수료"로 바꾸고, 색상도 바꾸기
// emerald(초록) → gray(회색)
<Badge className="bg-white/5 text-gray-400 border-white/10">수료</Badge>
```

> 👉 색상 코드는 `emerald`(초록), `blue`(파랑), `gray`(회색) 같은 영어 색 이름이에요.

---

## 5. ⭐ 상단 메뉴 바꾸기 (헤더)

📁 파일 위치: `src/components/layout/header.tsx`

### 메뉴 추가하거나 삭제하기

파일 위쪽에서 `navLinks`를 찾으세요. 이게 상단 메뉴 목록이에요.

```tsx
const navLinks = [
  { href: "/about", label: "소개" },
  { href: "/curriculum", label: "커리큘럼" },
  // ✏️ 새 메뉴를 추가하려면 아래처럼 한 줄 추가!
  { href: "/새주소", label: "메뉴이름" },
];
```

> 👉 `href`는 페이지 주소, `label`은 메뉴에 보이는 이름이에요.
> 👉 메뉴를 없애고 싶으면 해당 줄을 통째로 지우면 돼요.

### 로고 바꾸기

파일에서 `HRA`라는 글자를 찾아서 원하는 이름으로 바꾸세요.

### 로그인/로그아웃 버튼은?

> 💡 이건 자동이에요! 따로 건드릴 필요 없어요.
> - 로그인 안 한 사람 → "로그인" 버튼이 보여요
> - 일반 회원 → 이름 + 수업일지 메뉴 + 로그아웃 버튼
> - 관리자 → 이름 + 수업일지 + 관리자 메뉴 + 로그아웃 버튼

---

## 6. 하단(푸터) 바꾸기

📁 파일 위치: `src/components/layout/footer.tsx`

이메일, SNS 링크, 저작권 정보를 바꿀 수 있어요.

```tsx
// ✏️ 이메일 바꾸기 (한글/영어 부분만 수정)
<li>hra@example.com</li>  →  <li>myhra@gmail.com</li>

// ✏️ 인스타그램 주소 바꾸기 (href 안의 주소를 수정)
<a href="https://instagram.com/hra_official">Instagram</a>
```

---

## 7. 모집안내 페이지 바꾸기

📁 파일 위치: `src/app/(public)/recruitment/page.tsx`

### 모집 단계 변경

파일 위쪽에서 `processSteps`를 찾으세요.

```tsx
const processSteps = [
  { step: "STEP 1", title: "지원서 작성", subtitle: "Write Application" },
  // ✏️ title(한글)과 subtitle(영어)을 바꾸세요
];
```

---

## 8. 로그인 페이지 바꾸기

📁 파일 위치: `src/app/(auth)/login/page.tsx`

구글/카카오 로그인 버튼의 문구를 바꿀 수 있어요.

```tsx
// ✏️ 버튼 문구 바꾸기
"구글로 로그인"  →  "Google 계정으로 시작하기"
"카카오로 로그인"  →  "카카오톡으로 시작하기"
```

---

## 9. 관리자 왼쪽 메뉴 바꾸기 (사이드바)

📁 파일 위치: `src/app/(admin)/admin/admin-shell.tsx`

관리자 페이지 왼쪽에 있는 메뉴의 순서나 이름을 바꾸고 싶으면 `navItems`를 찾으세요.

```tsx
const navItems = [
  { href: "/admin", label: "대시보드", icon: LayoutDashboard },
  { href: "/admin/notices", label: "공지사항", icon: Bell },
  { href: "/admin/class-logs", label: "수업일지", icon: ClipboardList },
  { href: "/admin/recruitment", label: "기수 관리", icon: Users },
  { href: "/admin/gallery", label: "갤러리", icon: GalleryHorizontal },
  { href: "/admin/applications", label: "지원서", icon: FileText },
  { href: "/admin/users", label: "회원 관리", icon: UserCog },
  { href: "/admin/docs", label: "개발 문서", icon: BookOpen },
];
```

> 👉 `label`(한글 이름)을 바꾸면 메뉴 이름이 바뀌어요.
> 👉 순서를 바꾸면 메뉴 순서도 바뀌어요.
> 👉 줄을 삭제하면 해당 메뉴가 사라져요 (페이지 자체는 남아있어요).

---

## ⭐ 수정한 걸 실제 사이트에 반영하기

1. 파일 저장(`Ctrl + S`) → 내 컴퓨터에서 `npm run dev`로 켠 사이트에서 바로 확인 가능!
2. 실제 인터넷 사이트에도 반영하려면 → 터미널에서 이 3줄을 순서대로 입력:

```bash
git add .
git commit -m "어디를 바꿨는지 메모"
git push
```

> 👉 `git push`를 하면 Vercel이 자동으로 새 코드를 감지해서 사이트를 업데이트해줘요! 2~3분 기다리면 반영돼요.
