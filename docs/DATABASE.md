# 🗄️ HRA 웹사이트 데이터베이스 가이드

이 문서는 개발이 처음인 대학생분들이 HRA 웹사이트의 데이터베이스(DB) 구조를 이해하고, 직접 데이터를 관리할 수 있도록 돕기 위해 작성되었습니다.

---

## 1. 데이터베이스(DB)란 무엇인가요?

데이터베이스는 아주 똑똑한 **엑셀 파일**이라고 생각하면 쉽습니다. 웹사이트에 가입한 회원의 정보, 우리가 올린 공지사항, 학생들이 제출한 지원서 등을 안전하게 보관하는 '창고' 역할을 합니다.

### 기본 개념 정리
*   **테이블 (Table)**: 엑셀의 '시트'와 같습니다. (예: 사용자 시트, 지원서 시트)
*   **행 (Row/Record)**: 엑셀의 한 줄입니다. 한 명의 사용자 정보나 하나의 공지사항 글이 하나의 행이 됩니다.
*   **열 (Column/Field)**: 엑셀의 칸(제목)입니다. 이름, 이메일, 작성일 등 저장할 정보의 종류를 말합니다.
*   **관계형 DB**: 여러 테이블이 서로 연결되어 있는 구조입니다. 예를 들어, '공지사항' 테이블의 '작성자 ID' 칸을 보고 '사용자' 테이블에서 실제 작성자 이름을 찾아낼 수 있습니다.

---

## 2. Neon Postgres 대시보드 사용법

우리 프로젝트는 **Neon (neon.tech)**이라는 서비스를 사용해 데이터를 저장합니다. 직접 데이터를 확인하거나 수정하고 싶을 때 사용합니다.

1.  **접속 및 로그인**: [neon.tech](https://neon.tech/)에 접속하여 관리자 계정으로 로그인합니다.
2.  **프로젝트 선택**: 생성된 프로젝트(예: `hra-website`)를 클릭합니다.
3.  **SQL Editor 사용하기**:
    *   왼쪽 메뉴에서 **SQL Editor**를 누릅니다.
    *   여기에 명령어를 입력하고 `Run` 버튼을 누르면 DB를 조작할 수 있습니다.
4.  **테이블 목록 보기**: 왼쪽 메뉴의 **Tables** 탭을 누르면 현재 만들어진 테이블들과 그 안의 데이터를 엑셀처럼 바로 볼 수 있습니다.

---

## 3. 우리 프로젝트의 테이블 구조 (Schema)

`src/lib/db/schema.ts` 파일에 정의된 실제 테이블들을 하나씩 알아봅시다.

### ① 사용자 (`users`)
사이트를 이용하는 관리자와 멤버 정보를 저장합니다.
*   `id`: 각 사용자를 구별하는 고유한 번호 (자동 생성)
*   `name`: 이름 (예: "홍길동")
*   `email`: 이메일 (로그인 아이디로 사용)
*   `role`: 권한 (`ADMIN`은 관리자, `MEMBER`는 일반 회원)
*   `createdAt`: 가입한 날짜와 시간

### ② 모집 기수 (`cohorts`)
HRA의 각 기수(1기, 2기 등) 정보를 저장합니다.
*   `name`: 기수 이름 (예: "24기", "25기")
*   `recruitmentStatus`: 모집 상태 (`OPEN`이면 현재 지원 가능)
*   `startDate` / `endDate`: 기수 활동 기간

### ③ 지원서 (`applications`)
학생들이 웹사이트를 통해 제출한 지원서입니다.
*   `cohortId`: 어느 기수에 지원했는지 (기수 테이블과 연결됨)
*   `applicantName`: 지원자 이름
*   `motivation`: 지원 동기 (자기소개)

### ④ 공지사항 (`notices`) & 수업일지 (`classLogs`)
*   `title`: 제목
*   `content`: 내용
*   `authorId`: 이 글을 쓴 사람의 ID (사용자 테이블과 연결됨)
*   `pinned`: `true`면 공지사항 목록 맨 위에 고정됩니다.

### ⑤ 갤러리 (`galleries`) & 이미지 (`galleryImages`)
*   여러 장의 사진을 앨범 형태로 보여주기 위해 사용합니다.
*   하나의 갤러리(`id`)에 여러 개의 이미지(`galleryId`)가 연결되어 저장됩니다.

---

## 4. Drizzle ORM: 코드로 DB 다루기

우리 프로젝트는 복잡한 SQL 언어 대신 자바스크립트 코드로 데이터를 다루는 **Drizzle ORM**을 사용합니다.

### 데이터 조회 (Select) - 데이터 가져오기
```typescript
// 모든 사용자 가져오기
const allUsers = await db.select().from(users);

// 이메일이 'test@test.com'인 사용자 한 명만 찾기
const user = await db.query.users.findFirst({
  where: eq(users.email, 'test@test.com')
});
```

### 데이터 추가 (Insert) - 새 글 쓰기
```typescript
await db.insert(notices).values({
  title: '반갑습니다!',
  content: '새로운 공지사항입니다.',
  authorId: '관리자_ID_값'
});
```

### 데이터 수정 (Update) - 내용 바꾸기
```typescript
await db.update(users)
  .set({ role: 'ADMIN' }) // 권한을 관리자로 변경
  .where(eq(users.email, 'target@email.com')); // 특정 이메일을 가진 사람만
```

---

## 5. 데이터베이스 구조 변경하기 (Migration)

새로운 기능을 만들다가 "전화번호 칸이 더 필요해!"라고 느낀다면 아래 순서를 따르세요.

1.  `src/lib/db/schema.ts` 파일을 열어 원하는 테이블에 새 컬럼을 추가합니다.
2.  터미널에 아래 명령어를 입력합니다:
    ```bash
    npx drizzle-kit push
    ```
3.  성공 메시지가 뜨면 실제 Neon DB에도 반영된 것입니다.
    *   **주의**: 기존 데이터를 삭제하거나 타입을 완전히 바꿀 때는 데이터가 손실될 수 있으니 조심해야 합니다!

---

## 6. 관리자 계정 직접 만들기

#### 왜 필요한가요?
- 처음 사이트를 배포하면 관리자가 아무도 없음
- 누군가가 "최초 관리자"를 직접 지정해야 함
- 한 번만 하면 됨 — 이후에는 같은 방법으로 다른 사람도 관리자로 지정 가능

#### 준비물
- 사이트에 회원가입된 계정 (아직이라면 사이트의 `/register`에서 가입)
- Neon 대시보드 접속 권한 (프로젝트 생성자의 계정)

#### 단계별 따라하기

**1단계: Neon 대시보드에 로그인**
- 브라우저에서 [neon.tech](https://neon.tech/) 접속
- 오른쪽 상단 **Sign In** 클릭 → GitHub 또는 이메일로 로그인
- 프로젝트 목록에서 HRA 프로젝트 클릭

**2단계: SQL Editor 열기**
- 왼쪽 사이드바에서 **SQL Editor** 메뉴 클릭
- 빈 입력창이 나타남 — 여기에 명령어를 입력하고 실행할 수 있음

**3단계: 현재 사용자 확인**
```sql
-- 가입된 사용자 목록 확인
SELECT id, name, email, role FROM users;
```
- Run 버튼 클릭
- 표로 사용자 목록이 나옴 — role 열이 `MEMBER`인 것을 확인

**4단계: 관리자 권한 부여**
```sql
-- 이메일 부분을 본인이 가입한 이메일로 교체하세요!
UPDATE users SET role = 'ADMIN' WHERE email = '내이메일@example.com';
```
- Run 버튼 클릭
- 화면 하단에 `UPDATE 1` 또는 "1 row affected" 메시지가 뜨면 성공

**5단계: 변경 확인**
```sql
SELECT email, role FROM users WHERE role = 'ADMIN';
```
- 방금 변경한 이메일이 ADMIN으로 표시되면 완료

**6단계: 사이트에서 확인**
- 사이트 `/login`에서 로그인
- 상단 메뉴에 "관리자" 링크가 보이면 성공!
- 관리자 클릭 → `/admin` 대시보드 접속

#### 추가 관리자 지정
```sql
-- 팀원도 관리자로 만들기 (이메일만 바꿔서 같은 SQL 실행)
UPDATE users SET role = 'ADMIN' WHERE email = '팀원이메일@example.com';
```

#### 관리자 해제
```sql
-- 관리자 권한을 일반 회원으로 되돌리기
UPDATE users SET role = 'MEMBER' WHERE email = '해제할이메일@example.com';
```

#### 문제 해결
- "0 rows affected" 메시지 → 이메일 주소 오타 확인. `SELECT email FROM users;`로 정확한 이메일 확인
- role이 안 바뀌어 보임 → 사이트에서 로그아웃 후 다시 로그인 (세션 갱신 필요)

---

## 7. 자주 쓰는 SQL (Neon 대시보드용)

SQL은 DB와 대화하는 언어입니다. Neon 대시보드에서 유용하게 쓸 수 있는 명령어들입니다.

```sql
-- 1. 모든 사용자 목록 보기
SELECT * FROM users;

-- 2. 특정 사용자를 관리자로 승격시키기
UPDATE users SET role = 'ADMIN' WHERE email = 'student@example.com';

-- 3. 최근 제출된 지원서 10개만 보기
SELECT * FROM applications ORDER BY submitted_at DESC LIMIT 10;

-- 4. 잘못 등록된 공지사항 삭제하기
DELETE FROM notices WHERE id = '공지사항_ID_값';
```

---
💡 **팁**: 데이터베이스를 직접 건드리는 것은 위험할 수 있습니다. 중요한 작업을 하기 전에는 항상 어떤 데이터를 수정/삭제하는지 다시 한번 확인하세요!