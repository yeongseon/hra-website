# HRA 웹사이트 커스터마이징 가이드

이 문서는 개발을 처음 접하는 대학생 운영진이 웹사이트의 내용을 직접 수정할 수 있도록 돕기 위해 작성되었습니다. 각 페이지별로 어떤 파일을 열어서 어느 부분을 수정해야 하는지 단계별로 설명합니다.

---

## 💡 시작하기 전에
- **파일 경로**: 모든 파일 경로는 프로젝트 루트(최상위 폴더)를 기준으로 합니다.
- **수정 방법**: VS Code 등의 에디터에서 해당 파일을 열고, 설명된 코드를 찾아 원하는 내용으로 바꾼 뒤 저장하세요.
- **주의 사항**: 코드의 괄호(`{`, `}`, `(`, `)`)나 따옴표(`"`, `'`)가 지워지지 않도록 주의해 주세요.

---

## 1. 홈페이지 수정 (`src/app/(public)/page.tsx`)

홈페이지의 첫 화면(히어로 섹션), 통계, 주요 가치 등을 수정할 수 있습니다.

### 히어로 섹션 제목 및 문구 변경
파일의 32~38행 근처에서 메인 문구를 찾을 수 있습니다.

**[수정할 위치]**
```tsx
// 32행: 메인 큰 제목
<h1 className="text-5xl font-extrabold tracking-tight sm:text-7xl lg:text-8xl text-transparent bg-clip-text bg-gradient-to-br from-white via-gray-200 to-gray-500 pb-2 leading-tight">
  인간 르네상스<br />아카데미
</h1>

// 36행: 한 줄 설명
<p className="max-w-2xl text-lg sm:text-xl text-gray-400 font-light tracking-wide">
  당신의 가능성을 깨우는 곳. 최고의 인재들과 함께 한계를 넘어 성장하세요.
</p>
```

**[수정 예시]**
```tsx
// 변경 후
<h1 className="text-5xl font-extrabold ...">
  새로운 미래를<br />만드는 HRA
</h1>
<p className="max-w-2xl text-lg ...">
  인문학과 기술의 조화. HRA 4기에 지금 바로 도전하세요.
</p>
```

### 핵심 가치 카드 수정
파일의 68~107행 근처에서 3가지 핵심 가치(도전, 성장, 경험)를 수정할 수 있습니다.

**[수정할 위치]**
```tsx
// 75행: 제목 수정
<h3 className="text-2xl font-bold mb-4">도전 (Challenge)</h3>
// 76행: 설명 수정
<p className="text-gray-400 leading-relaxed">
  "한계를 넘어서는 도전정신을 키웁니다"
</p>
```

### 통계 수치 변경
파일의 113~130행 근처에서 통계 숫자를 수정합니다.

**[수정할 위치]**
```tsx
// 115행: 기수 숫자
<div className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 mb-2">0</div>
// 119행: 수료생 숫자
<div className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 mb-2">100+</div>
```

---

## 2. 소개 페이지 수정 (`src/app/(public)/about/page.tsx`)

학회의 비전, 핵심 가치, 연혁을 수정합니다.

### 상단 소개 문구 변경
파일의 26~32행 사이의 텍스트를 수정합니다.

### 핵심 가치 카드 수정
파일의 38~75행 사이에서 4가지 가치(인문학, 기술, 공동체, 실천)의 제목과 설명을 수정할 수 있습니다.

### 연혁(History) 항목 추가 및 수정
파일의 81~112행 사이에서 연혁 항목을 수정하거나 복사하여 추가할 수 있습니다.

**[수정할 위치]**
```tsx
// 102~111행: 한 항목의 단위입니다. 이 부분을 복사해서 위에 붙여넣으면 새 항목이 생깁니다.
<div className="relative">
  <div className="absolute w-3 h-3 bg-white/20 rounded-full -left-[23px] top-1.5" />
  <div className="text-gray-400 mb-1">2025</div>
  <h3 className="text-xl font-medium text-white">
    2기
  </h3>
  <p className="text-gray-400 mt-2">
    커뮤니티 확장과 커리큘럼 심화
  </p>
</div>
```

---

## 3. 커리큘럼 수정 (`src/app/(public)/curriculum/page.tsx`)

봄/가을 학기별 과목명과 설명을 수정합니다.

### 학기 이름 및 과목 수정
- **봄학기**: 37~73행
- **가을학기**: 75~111행

**[수정할 위치]**
```tsx
// 48행: 과목 제목
<h3 className="text-2xl font-medium text-white">인문학 세미나</h3>
// 50행: 시간/빈도
<span className="text-sm text-gray-400 font-mono bg-black/50 px-3 py-1 rounded-full">
  주 1회, 2시간
</span>
// 55행: 상세 설명
<p className="text-gray-500 leading-relaxed">
  인간의 가치와 사회 구조를 이해하기 위한 기초 텍스트와 철학적 프레임워크를 탐구합니다.
</p>
```

---

## 4. 기수 소개 수정 (`src/app/(public)/cohorts/page.tsx`)

현재 활동 중이거나 수료한 기수의 정보를 관리합니다. (이 페이지는 현재 하드코딩되어 있습니다.)

### 기수 정보 수정
각 기수는 하나의 `div` 블록으로 이루어져 있습니다. (38~64행: 3기, 66~92행: 2기, 94~120행: 1기)

### 상태 변경 (예정/진행중/수료)
`Badge` 컴포넌트의 텍스트와 색상을 변경합니다.

**[수정할 위치]**
```tsx
// 72행: 진행중 상태를 수료로 변경하고 싶을 때
<Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 rounded-full px-3 py-1">
  진행중
</Badge>

// 변경 후
<Badge variant="outline" className="bg-white/5 text-gray-400 border-white/10 rounded-full px-3 py-1">
  수료
</Badge>
```

---

## 5. 헤더 수정 (`src/components/layout/header.tsx`)

상단 네비게이션 메뉴의 이름이나 링크를 수정합니다.

### 메뉴 항목 추가/수정/삭제
파일 상단의 `navLinks` 배열(27~34행)을 수정합니다.

**[수정할 위치]**
```tsx
const navLinks = [
  { href: "/about", label: "소개" },
  { href: "/curriculum", label: "커리큘럼" },
  // 여기에 항목을 추가하거나 기존 항목을 삭제/수정하세요.
];
```

### 로고 텍스트 변경
파일의 52~54행 사이의 `HRA`를 원하는 이름으로 바꿉니다.

---

## 6. 푸터 수정 (`src/components/layout/footer.tsx`)

하단의 이메일, SNS 링크, 저작권 정보를 수정합니다.

### 프로그램 설명 변경
파일의 30~36행 사이의 텍스트를 수정합니다.

### 이메일 및 SNS 주소 수정
파일의 78~88행 사이를 수정합니다.

**[수정할 위치]**
```tsx
// 78행: 이메일
<li className="text-sm text-gray-500">hra@example.com</li>

// 81행: 인스타그램 링크 (href 안의 주소를 수정하세요)
<a href="https://instagram.com" target="_blank" ...>
  Instagram
</a>
```

---

## 7. 모집안내 수정 (`src/app/(public)/recruitment/page.tsx`)

모집 단계(Step)와 안내 문구를 수정합니다.

### 모집 단계(STEP) 변경
파일 상단의 `processSteps` 배열(35~40행)을 수정합니다.

**[수정할 위치]**
```tsx
const processSteps = [
  { step: "STEP 1", title: "지원서 작성", subtitle: "Write Application" },
  // title(한글)과 subtitle(영어)을 수정하세요.
];
```

### 안내 문구 수정
파일의 116~119행 사이의 텍스트를 수정합니다.

---

## 8. 로그인/회원가입 수정 (`src/app/(auth)/login/page.tsx`, `register/page.tsx`)

입력창의 안내 문구(placeholder)를 수정합니다.

**[수정할 위치]**
```tsx
// login/page.tsx 90행: 이메일 입력창
<Input id="email" type="email" placeholder="이메일을 입력하세요" ... />

// register/page.tsx 90행: 이름 입력창
<Input id="name" type="text" placeholder="홍길동" ... />
```

---

## 🛠️ 수정 사항 반영하기
코드를 수정한 후 파일을 저장하면, 실행 중인 개발 서버(`npm run dev`)에서 즉시 변경 사항을 확인할 수 있습니다. 실제 서비스에 반영하려면 `git commit` 후 `git push`를 통해 배포 과정을 거쳐야 합니다.
