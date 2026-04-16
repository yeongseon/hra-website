# 코드 컨벤션 — HRA 프로젝트 약속하기

HRA 웹사이트 프로젝트에 오신 것을 환영해요! 
여러 사람이 함께 코드를 작성하다 보면 각자 스타일이 달라 코드를 읽기 어려워질 때가 있어요. 
그래서 우리 프로젝트만의 작고 소중한 규칙들을 정해두었답니다. 초보자분들도 쉽게 따라 할 수 있으니 천천히 읽어봐 주세요.

---

### 1. 한국어 UI 규칙: 사용자와는 한국어로 대화해요
우리 사이트는 한국 사용자를 위한 서비스예요. 
버튼 텍스트, 에러 메시지, 플레이스홀더 등 **사용자 눈에 보이는 모든 글자는 한국어**로 적어주세요. 
단, 코드 내부의 변수명이나 주석, 파일명은 관례에 따라 영어를 사용해요.

*   **좋은 예**: `<button>로그인하기</button>`, `placeholder="이름을 입력하세요"`
*   **나쁜 예**: `<button>Login</button>`, `alert("Please check your input")`

---

### 2. TypeScript 규칙: 타입을 명확하게 알려주세요
TypeScript는 우리가 코딩 실수를 하지 않게 도와주는 든든한 친구예요. 
귀찮다고 타입을 대충 넘기면 나중에 큰 버그가 생길 수 있어요.

*   **`as any` 금지**: 데이터가 어떤 형태인지 모르겠다면 `unknown`을 쓰거나 인터페이스를 정의해주세요.
*   **`@ts-ignore` 금지**: 에러가 난다면 무시하지 말고 근본적인 원인을 해결해야 해요.

```typescript title="타입 정의하기"
// ✅ 좋은 예: 인터페이스로 타입을 명확히 정의해요
interface User {
  id: string;
  name: string;
}

function greet(user: User) {
  return `${user.name}님, 안녕하세요!`;
}

// ❌ 나쁜 예: any를 남발하면 TypeScript를 쓰는 의미가 없어져요
function greet(user: any) {
  return user.name + "님 안녕하세요";
}
```

---

### 3. Tailwind CSS v4: 스타일은 클래스로 입혀요
우리 프로젝트는 Tailwind CSS를 사용해요. 별도의 CSS 파일을 만들지 않고 HTML 클래스 안에 디자인을 바로 적을 수 있어 편리해요.

*   **유틸리티 클래스 우선**: Tailwind가 제공하는 클래스(`flex`, `text-blue-500`, `p-4` 등)를 최대한 활용하세요.
*   **인라인 스타일 금지**: `style={{ color: 'red' }}` 같은 방식은 유지보수가 힘들어지니 피해 주세요.

```tsx title="스타일링"
// ✅ 좋은 예: Tailwind 클래스를 사용해요
<div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
  <span className="text-lg font-bold text-blue-600">공지사항</span>
</div>

// ❌ 나쁜 예: 인라인 스타일은 피해주세요
<div style={{ display: 'flex', padding: '16px', backgroundColor: '#f9fafb' }}>
  <span style={{ fontWeight: 'bold' }}>공지사항</span>
</div>
```

---

### 4. 파일 및 폴더 구조: 정해진 위치에 넣어주세요
Next.js App Router 구조를 따르고 있어요. 각 폴더의 역할을 기억해주세요.

*   `src/app`: 페이지 주소(URL)와 매칭되는 폴더들이에요.
*   `src/components`: 여러 페이지에서 공통으로 쓰는 작은 부품(버튼, 입력창 등)들이 모여요.
*   `src/features`: 특정 기능(로그인, 게시판 등)과 관련된 복잡한 비즈니스 로직이나 서버 액션이 위치해요.
*   `src/lib`: 외부 라이브러리 설정(DB 연결, 인증 설정 등)이나 공통 도구들이 들어있어요.

---

### 5. 컴포넌트 작성 규칙: 서버와 클라이언트를 구분해요
React 19와 Next.js 16에서는 컴포넌트의 역할을 나누는 게 중요해요.

*   **Server Component**: 기본값이에요. 데이터를 가져오거나 보안이 중요한 작업은 여기서 해요.
*   **Client Component**: 클릭 이벤트, `useState` 같은 상태 변화가 필요할 때만 파일 맨 위에 `'use client'`를 적고 사용해요.

```tsx title="컴포넌트 구분"
// ✅ 좋은 예: 클릭 이벤트가 필요할 때만 클라이언트 컴포넌트로 만들어요
'use client';

import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}번 클릭함</button>;
}
```

---

### 6. 이름 짓기 규칙: 통일감을 유지해요
이름만 봐도 이게 무엇인지 알 수 있게 규칙을 지켜주세요.

*   **폴더/파일명**: 소문자 사이에 하이픈을 넣는 **kebab-case**를 사용해요. (예: `user-profile/page.tsx`)
*   **컴포넌트 이름**: 첫 글자를 대문자로 시작하는 **PascalCase**를 사용해요. (예: `UserProfile`)
*   **변수/함수 이름**: 첫 단어는 소문자, 그 뒤는 대문자로 시작하는 **camelCase**를 사용해요. (예: `getUserData`)

---

### 7. 커밋 메시지 규칙: 변화의 발자취를 남겨요
나중에 어떤 작업을 했는지 쉽게 찾을 수 있게 커밋 메시지 앞에 꼬리표를 달아주세요.

*   `feat:`: 새로운 기능 추가
*   `fix:`: 버그 수정
*   `docs:`: 문서 수정 (지금 여러분이 읽고 있는 이 문서 같은 경우예요!)
*   `refactor:`: 코드 구조 개선
*   `style:`: 코드 포맷팅, 세미콜론 누락 등 (디자인 수정이 아니에요!)

---

### 8. Import 순서: 깔끔하게 정리해요
파일 맨 윗부분의 `import` 구문도 순서대로 정리하면 보기에 훨씬 좋아요.

1.  **React**: `import React from 'react'`
2.  **Next.js**: `import Link from 'next/link'`
3.  **외부 라이브러리**: `import { clsx } from 'clsx'`
4.  **내부 모듈**: `import { Button } from '@/components/ui/button'`

---

규칙이 조금 많아 보일 수도 있지만, 익숙해지면 훨씬 편하게 코딩할 수 있을 거예요. 
함께 즐겁게 HRA 프로젝트를 만들어가요!

