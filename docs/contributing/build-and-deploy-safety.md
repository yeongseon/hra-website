# 🛡️ 빌드·배포 안전 가이드 — 11회 push 실패 사고에서 배운 것

> **이 문서를 꼭 읽어야 하는 사람**: HRA 웹사이트에 코드를 push 하는 모든 분들 (특히 대학생/처음 기여하는 분).
> **읽는 데 걸리는 시간**: 10분.
> **이걸 안 읽으면**: Vercel 배포 실패 → 사이트가 잠시 깨질 수 있음 → 11번 다시 push 하는 슬픈 사이클.

---

## 1. 왜 이 가이드가 생겼나요? (실제 사고 이야기)

2026년 5월 8일~9일, 한 작업자가 공지사항·언론보도 페이지에 **페이지네이션(쪽 번호)** 기능을 추가했습니다. 코드는 잘 짠 것 같았고, 로컬에서 `npm run dev` 로 화면도 잘 떠서 바로 GitHub 에 push 했습니다.

그런데 Vercel 배포가 실패했습니다. 다시 한 줄 고치고 push, 또 실패. 또 고치고 push, 또 실패. **이 사이클이 11번 반복되었습니다.**

```
5f11df9  fix: press pagination closing bracket
5019a0f  fix: resolve build errors
8f04e33  fix: press pagination syntax
6c9ce26  fix: press pagination syntax
6db8958  fix: recruitment apply page props type
df643d6  fix: searchParams undefined issue
072cb46  fix: press pagination and searchParams
06dda16  fix: press pagination and searchParams
d0f9dfc  fix: press pagination and searchParams
b5a09f7  fix: press pagination and searchParams
5f4ac2d  fix: recruitment searchParams type
```

11번이나 같은 파일을 고친 이유는 단 하나, **로컬에서 `npm run build` 를 한 번도 돌리지 않았기 때문**입니다.

`npm run dev` (개발 서버) 와 `npm run build` (실제 배포용 빌드) 는 다릅니다. `dev` 는 느슨하게, `build` 는 엄격하게 검사합니다. Vercel 은 `build` 를 돌리기 때문에, 로컬 `dev` 만 확인하고 push 하면 **Vercel 을 컴파일러처럼 사용**하게 됩니다. 그러면 매번 1~3분씩 기다리고 깨진 사이트를 사용자에게 보여주게 됩니다.

이 사고로 정확히 두 가지 실수가 드러났습니다. 둘 다 아래 §3 에서 자세히 설명합니다.

1. **Next.js 16 의 새로운 규칙을 몰랐음** (`searchParams` 가 `Promise` 가 됨)
2. **JSX 괄호 매칭이 깨졌음** (`{조건 && (...)}` 의 `)}` 위치 실수)

---

## 2. 자동 가드: Husky 훅 (이미 켜져 있음)

다행히 이제는 **사람이 잊어도 컴퓨터가 막아줍니다**. 저장소를 클론하고 `npm install` 만 실행하면 자동으로 활성화됩니다.

### 2-1. pre-commit 훅 (커밋 직전 자동 실행)

```bash
git commit -m "..."
# 👇 자동으로 실행됨
🔍 [pre-commit] 타입 검사 실행 중... (보통 10~20초)
✅ [pre-commit] 통과
```

- **검사 내용**: `npm run typecheck` (TypeScript 타입 체크)
- **소요 시간**: 10~20초
- **실패하면**: 커밋 자체가 안 됨. 빨간 메시지 읽고 파일 고친 뒤 다시 커밋.

### 2-2. pre-push 훅 (push 직전 자동 실행)

```bash
git push
# 👇 자동으로 실행됨
🏗️  [pre-push] Next.js 프로덕션 빌드 검증 중... (1~3분)
    Vercel 배포 전 마지막 안전망입니다. 잠시만 기다려주세요.
✅ [pre-push] 빌드 통과! 안전하게 push 합니다.
```

- **검사 내용**: `npm run build` (Vercel 과 100% 동일한 검증)
- **소요 시간**: 1~3분
- **실패하면**: push 가 차단됨. **이게 11회 사고를 막아주는 마지막 안전벨트입니다.**

### 2-3. ⚠️ `--no-verify` 로 우회하지 마세요

```bash
# 🚫 절대 하지 마세요!
git commit --no-verify -m "..."
git push --no-verify
```

- 1~3분 기다리는 게 귀찮을 수 있지만, **Vercel 배포 실패하고 11번 다시 push 하는 것보다 백배 빠릅니다.**
- 진짜로 급한 hotfix 가 아니면 절대 우회하지 마세요. (그리고 hotfix 도 거의 없습니다.)

### 2-4. 훅이 동작하지 않는다면

```bash
npx husky        # 훅 재활성화
chmod +x .husky/pre-commit .husky/pre-push   # 실행 권한 부여 (Mac/Linux)
```

---

## 3. 학생들이 자주 빠지는 함정 5가지

### 3-1. 🪤 Next.js 16 의 `searchParams` 와 `params` 는 Promise 다

이번 사고의 직접적인 원인입니다. **Next 14 강의나 옛 블로그 글을 보고 따라하면 100% 빌드 실패**합니다.

#### ❌ 옛날 패턴 (Next 14 까지)

```tsx
// src/app/(public)/press/page.tsx
export default async function PressPage({
  searchParams,
}: {
  searchParams?: { page?: string };  // ❌ 동기 객체
}) {
  const currentPage = Number(searchParams?.page ?? "1");  // ❌ await 없음
  // ...
}
```

빌드 시 이런 에러가 납니다:
```
Type error: Type '{ page?: string }' is missing the following properties from type 'Promise<...>': then, catch, finally, ...
```

#### ✅ Next 16 정답

```tsx
export default async function PressPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;  // ✅ Promise<...>
}) {
  const params = await searchParams;          // ✅ await 필수
  const currentPage = Number(params.page ?? "1");
  // ...
}
```

같은 규칙이 동적 라우트의 `params` 에도 적용됩니다:

```tsx
// src/app/(public)/notices/[id]/page.tsx
export default async function NoticeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;   // ✅ Promise<...>
}) {
  const { id } = await params;       // ✅ await
  // ...
}
```

> **외우는 팁**: Next 16 에서는 페이지 컴포넌트의 모든 props 가 비동기입니다. **`Promise<>` 로 감싸고 `await` 한다.** 이 두 단어만 기억하세요.

---

### 3-2. 🪤 JSX 괄호 매칭 (`{조건 && (...)}` 의 `)}`)

조건부 렌더링 블록을 추가할 때 닫는 `)}` 를 한 칸 빠뜨리거나 잘못 넣어서 발생합니다.

#### ❌ 깨진 예 (실제 사고 코드)

```tsx
{articles.length > 0 && (
  <section>
    {/* ... */}
    </section>
  )}                          {/* ✅ 외부 블록 닫힘 */}

  {totalPages > 1 && (        {/* 새로 추가한 블록 */}
    <div>...</div>
  )}
)}                            {/* ❌ 짝이 안 맞는 )} 가 남음 */}
```

#### ✅ 올바른 예

```tsx
{articles.length > 0 && (
  <section>
    {/* ... */}
  </section>
)}

{totalPages > 1 && (
  <div>...</div>
)}
```

> **확인 팁**:
> 1. VS Code 에서 여는 괄호 옆을 클릭하면 닫는 괄호가 하이라이트됩니다.
> 2. `{` 와 `}`, `(` 와 `)` 의 개수가 맞는지 의식적으로 세어보세요.
> 3. 새 조건부 블록 추가 후 **반드시** `npm run build` 를 한 번 돌리세요. (pre-push 훅이 잡아주지만 미리 확인하면 더 빠름)

---

### 3-3. 🪤 `zod` 가 아니라 `zod/v4` 에서 import

```typescript
// ❌ 옛날 방식
import { z } from "zod";

// ✅ 이 프로젝트의 규칙
import { z } from "zod/v4";
```

이걸 안 지키면:
```
Module '"zod"' has no exported member 'object'
```

같은 에러가 납니다. 모든 새 파일에서 반드시 `zod/v4` 로 import 하세요.

---

### 3-4. 🪤 `npm run dev` 만 보고 push 하지 말기

`dev` 는 빠르지만 느슨합니다. 다음 종류의 에러는 `dev` 에서 안 잡히고 `build` 에서만 잡힙니다:

| 에러 종류 | dev | build |
|---|---|---|
| TypeScript 타입 에러 | ⚠️ 경고만, 화면은 뜸 | ❌ 빌드 실패 |
| 일부 import 경로 문제 | ⚠️ 런타임에야 발견 | ❌ 빌드 실패 |
| Server Component / Client Component 경계 위반 | 가끔 통과 | 엄격히 검사 |
| Next 16 async params 위반 | 가끔 동작 | ❌ 빌드 실패 |

**규칙**: push 전에 반드시 한 번은 `npm run build` 를 돌리세요. (pre-push 훅이 자동으로 해주지만, 직접 돌려보면 push 가 더 빠릅니다.)

---

### 3-5. 🪤 영어 UI 텍스트 / `as any` / `@ts-ignore`

이 프로젝트는 한국어 사이트입니다. 사용자에게 보이는 모든 텍스트는 한국어여야 합니다.

```tsx
// ❌
<button>Submit</button>
<h1>Welcome</h1>

// ✅
<button>제출하기</button>
<h1>환영합니다</h1>
```

타입 에러가 났다고 `as any` / `@ts-ignore` 로 덮지 마세요. 그건 다음 사람이 같은 에러를 또 만나게 합니다.

```typescript
// ❌
const user = data as any;
// @ts-ignore
const result = brokenFunction();

// ✅ — 진짜 타입을 정의하거나, 함수 시그니처를 고치세요
const user = data as { id: string; name: string };
```

---

## 4. push 전 체크리스트 (1분이면 끝)

매번 push 전에 머릿속으로 확인하세요. (자동 훅이 대부분 잡아주지만, 한 번 더 보는 게 빠릅니다.)

- [ ] `npm run build` 가 로컬에서 통과했는가?
- [ ] 새 페이지 컴포넌트의 `params` / `searchParams` 가 `Promise<...>` + `await` 인가?
- [ ] `import { z } from "zod/v4"` 인가? (`"zod"` 단독 X)
- [ ] 새 JSX `{조건 && (...)}` 블록의 `)}` 짝이 맞는가?
- [ ] 사용자에게 보이는 텍스트가 한국어인가?
- [ ] `as any` / `@ts-ignore` / `@ts-expect-error` 안 썼는가?
- [ ] 다중 파일 변경이라면 [Oracle 리뷰](../../AGENTS.md#11-코드-리뷰-정책-oracle-필수) 받았는가?

---

## 5. 빌드 실패 에러 → 해결법 빠른 검색표

빌드가 실패하면 빨간 메시지에서 키워드를 찾아 아래 표에서 해결법을 찾으세요.

| 에러 메시지의 일부 | 진짜 원인 | 해결 방법 |
|---|---|---|
| `is missing ... 'then'` | `searchParams` 동기 타입 사용 | `Promise<{ ... }>` + `await` |
| `searchParams.xxx` 가 undefined | `await` 누락 | `const params = await searchParams` 후 `params.xxx` |
| `Unexpected token` / `Expression expected` | JSX 괄호 매칭 깨짐 | 새로 추가한 `{...&&(...)}` 의 `)}` 위치 점검 |
| `Module '"zod"' has no exported member ...` | zod v4 import 경로 누락 | `from "zod/v4"` 로 수정 |
| `Cannot use 'await' in non-async function` | 함수에 `async` 없음 | `export default async function ...` |
| `Type 'X' is not assignable to type 'Y'` | 타입 불일치 | `as any` 로 덮지 말고 진짜 타입을 맞추기 |
| `Module not found: Can't resolve '...'` | import 경로 오타 / 파일 위치 | 경로/파일명 다시 확인 |

---

## 6. 그래도 막힌다면

1. **에러 메시지 끝까지 읽기** — 보통 진짜 원인은 마지막 줄에 있습니다.
2. **에러 메시지를 그대로 검색** — 위 표에 없으면 Google 에 그대로 붙여넣기.
3. **GitHub 이슈 / 팀장에게 도움 요청** — 시도한 것과 에러 메시지를 함께 첨부.
4. **절대 `--no-verify` 로 우회하지 말기** — 그건 다음 사람에게 더 큰 폭탄을 넘기는 일입니다.

---

## 7. 관련 문서

- [협업 워크플로우](workflow.md) — 브랜치, 커밋, PR 만들기
- [코드 컨벤션](conventions.md) — 변수명, 파일명 규칙
- [AGENTS.md §12 (저장소 루트)](../../AGENTS.md) — 가드 정책 전문
- [품질 게이트 (docs/QUALITY-GATE.md)](../QUALITY-GATE.md) — CI/CD 통과 기준

> 이 문서가 11번의 사고를 다시는 만들지 않는 데 도움이 되기를 바랍니다.
> 모르는 게 있으면 부끄러워하지 말고 물어보세요. 모두가 한 번씩은 겪는 일입니다.
