# 카카오 로그인 설정 가이드 (2025 콘솔 개편 반영)

> ⚠️ **중요 — 이 문서가 `DEPLOYMENT.md`보다 정확합니다.**
> 카카오 개발자 콘솔이 2025년에 OAuth 설정 위치를 전면 개편했습니다.
> 기존 가이드(`docs/DEPLOYMENT.md` ⑥번 카카오 로그인 섹션)는 옛 UI 기준이라
> Redirect URI / Client Secret 위치가 실제와 다릅니다. 이 문서를 우선 참고하세요.

---

## 0. 한 줄 요약

> **카카오 콘솔의 모든 OAuth 설정(Redirect URI, Client Secret)은 이제 한 곳에 모여 있습니다:**
>
> **`앱 설정 → 플랫폼 키 → REST API 키 행의 [더보기 ⋮] → 수정`**
>
> 이 한 페이지에서 모든 작업이 끝납니다.

---

## 1. 옛 UI vs 새 UI 차이

| 설정 항목 | 옛 UI (구버전 가이드) | **새 UI (2025~)** |
|---|---|---|
| REST API 키 | 앱 설정 → 일반 | **앱 설정 → 플랫폼 키** (URL: `/config/platform-key`) |
| OAuth Redirect URI | 카카오 로그인 → 일반 → "Redirect URI" | **REST API 키 수정 페이지 → "카카오 로그인 리다이렉트 URI"** |
| Client Secret 발급 | 카카오 로그인 → 보안 → "코드 생성" | **자동 발급됨** (REST API 키 생성 시 기본 활성화) |
| Client Secret 확인 | 카카오 로그인 → 보안 | **REST API 키 수정 페이지 → "클라이언트 시크릿"** |
| 로그아웃 리다이렉트 URI | 카카오 로그인 → 고급 | (그대로) 카카오 로그인 → 고급 |

> ⚠️ **자주 하는 실수**: "Redirect URI"가 보이지 않아서 **카카오 로그인 → 고급 페이지의 "로그아웃 리다이렉트 URI"** 에 등록하는 경우가 있습니다.
> 이건 **로그인 후 리다이렉트가 아니라 "로그아웃 시 리다이렉트"** 라서 OAuth 콜백이 동작하지 않습니다. 반드시 위 표의 "새 UI" 위치에 등록하세요.

---

## 2. 등록 절차 (전체 9단계)

### STEP 1 — 앱 생성

1. https://developers.kakao.com → 우측 상단 로그인
2. **내 애플리케이션 → 애플리케이션 추가하기**
3. 입력값:
   - **앱 아이콘**: HRA 로고 (선택)
   - **앱 이름**: `HRA (Human Renaissance Academy)` 또는 `HRA 아카데미`
   - **회사명**: HRA를 운영하는 실제 단체/법인명
   - **카테고리**: 교육
   - **앱 대표 도메인**: `hra-website-theta.vercel.app` (`https://` 제외, 도메인만)
4. 저장

### STEP 2 — REST API 키 확인

1. 좌측 메뉴 **앱 설정 → 플랫폼 키** 클릭 (URL: `/config/platform-key`)
2. **REST API 키** 섹션의 32자 문자열 = `AUTH_KAKAO_ID` 값

### STEP 3 — 카카오 로그인 활성화

1. 좌측 메뉴 **제품 설정 → 카카오 로그인 → 일반** 클릭 (URL: `/product/login`)
2. **사용 설정 → 상태** 토글을 **ON** 으로 변경

> 💡 이 페이지에는 이제 "사용 설정"과 "OpenID Connect" 두 섹션만 있습니다. Redirect URI는 더 이상 여기에 없습니다.

### STEP 4 — Redirect URI 등록 (핵심)

1. 좌측 메뉴 **앱 설정 → 플랫폼 키** 로 이동
2. **REST API 키** 행 우측의 **⋮ (더보기)** 클릭 → **수정** 선택
   - URL 직접 이동 시: `/config/platform-key/rest/{키ID}`
3. **REST API 키 수정** 페이지에서 아래로 스크롤하면 다음 5개 섹션이 보입니다:
   - 키 이름 (필수)
   - 호출 허용 IP 주소
   - **카카오 로그인 리다이렉트 URI** ← **이 섹션**
   - 비즈니스 인증 리다이렉트 URI (건드리지 말 것)
   - 클라이언트 시크릿
4. **카카오 로그인 리다이렉트 URI** 입력란에 다음 두 줄을 한 줄씩 추가:
   ```
   http://localhost:3000/api/auth/callback/kakao
   https://hra-website-theta.vercel.app/api/auth/callback/kakao
   ```
   > ⚠️ 정확히 그대로 (소문자, `callback`, 끝에 슬래시 없음). 한 글자라도 다르면 "redirect_uri_mismatch" 오류 발생.
5. 페이지 맨 아래 **저장** 버튼 클릭

### STEP 5 — Client Secret 확인 (이미 자동 활성화됨)

같은 **REST API 키 수정** 페이지의 **클라이언트 시크릿** 섹션에 가면:

- **카카오 로그인** 그룹 → **활성화: ON** (자동) → **코드** 값이 표시됨 = `AUTH_KAKAO_SECRET` 값
- 비즈니스 인증 그룹은 무시 (NextAuth는 카카오 로그인 그룹 코드만 사용)

> 💡 **2025년 정책 변경**: REST API 키 발급 시 클라이언트 시크릿이 **기본 활성화** 상태로 자동 생성됩니다. 따로 "코드 생성" / "사용함 토글" 같은 단계는 더 이상 필요 없습니다.
>
> **만약 활성화가 OFF로 바뀌어 있다면**: 같은 행의 토글을 ON으로 변경 후 저장.

### STEP 6 — 동의항목 설정

1. 좌측 메뉴 **제품 설정 → 카카오 로그인 → 동의항목** (URL: `/product/login/scope`)
2. 다음 두 항목만 설정:
   | 항목 | 동의 단계 |
   |---|---|
   | **닉네임** (`profile_nickname`) | **필수 동의** |
   | **프로필 사진** (`profile_image`) | 선택 동의 |
3. **이메일** (`account_email`)은 **건드리지 말 것**
   - 일반 앱은 "필수 동의" 선택 시 거부됨 (비즈앱 심사 필요)
   - 닉네임만으로도 로그인 정상 동작

### STEP 7 — Vercel 환경변수 등록

Vercel 대시보드 → HRA 프로젝트 → **Settings → Environment Variables**:

| Key | Value | 환경 |
|---|---|---|
| `AUTH_KAKAO_ID` | STEP 2의 REST API 키 (32자) | Production / Preview / Development 모두 |
| `AUTH_KAKAO_SECRET` | STEP 5의 클라이언트 시크릿 코드 | Production / Preview / Development 모두 |

> ⚠️ 두 값 모두 매우 민감합니다. 채팅, 깃 저장소, 공개 문서 등에 절대 노출하지 마세요. 노출 시 즉시 카카오 콘솔에서 재발급(REST API 키는 "복제 키 생성" 후 옛 키 비활성, Client Secret은 "코드 재발급").

### STEP 8 — Vercel Redeploy (필수)

Deployments 탭 → 최신 Production 배포 우측 **⋯ → Redeploy** → 확인

> ⚠️ **이 단계 빼먹으면 카카오 로그인 버튼이 절대 안 보입니다.** 환경변수는 빌드 시점에만 주입됩니다.

### STEP 9 — 동작 확인

1. 재배포 완료(1~2분) 후 https://hra-website-theta.vercel.app/login 접속
2. **"카카오로 로그인"** 버튼이 나타나면 성공
3. 클릭 → 카카오 동의 화면 → 동의 → HRA 사이트로 복귀하면 완료

---

## 3. 트러블슈팅

### 증상: "카카오로 로그인" 버튼이 안 보임
**원인**: 환경변수 미등록 또는 Redeploy 안 함
**해결**: STEP 7, 8 재확인. Vercel **Settings → Environment Variables**에 두 키가 모두 있는지, 등록 후 Redeploy 했는지 확인.

### 증상: 카카오 동의 화면에서 "redirect_uri_mismatch" 오류
**원인**: Redirect URI 등록 위치/값 오류
**해결**:
- STEP 4 위치(REST API 키 수정 페이지)에 등록했는지 확인 (고급 페이지의 "로그아웃 리다이렉트 URI"가 아님)
- 오타 확인: `/api/auth/callback/kakao` (소문자, 끝 슬래시 없음)
- 프로덕션·로컬 두 줄 모두 등록됐는지 확인

### 증상: 동의 화면에서 "이메일이 필요합니다" 같은 오류
**원인**: 동의항목에서 이메일을 "필수 동의"로 설정함 (일반 앱은 거부됨)
**해결**: STEP 6대로 이메일은 건드리지 말고 닉네임만 필수 동의로 설정

### 증상: 로그인 후 "invalid_client" 오류
**원인**: Client Secret 활성화 OFF 또는 코드 불일치
**해결**:
- REST API 키 수정 페이지의 **클라이언트 시크릿 → 카카오 로그인 → 활성화** 가 ON인지 확인
- Vercel `AUTH_KAKAO_SECRET` 값이 STEP 5에서 본 코드와 정확히 일치하는지 확인
- 코드 재발급 시 Vercel 환경변수도 갱신 + Redeploy

---

## 4. 코드 동작 원리 (참고)

### `src/lib/auth.ts`
```typescript
// 카카오 로그인: AUTH_KAKAO_ID, AUTH_KAKAO_SECRET 둘 다 있어야 활성화
if (process.env.AUTH_KAKAO_ID && process.env.AUTH_KAKAO_SECRET) {
  providers.push(
    Kakao({
      clientId: process.env.AUTH_KAKAO_ID,
      clientSecret: process.env.AUTH_KAKAO_SECRET,
    })
  );
}
```
환경변수 둘 중 하나라도 비어있으면 provider가 등록되지 않고, 로그인 폼에 버튼도 표시되지 않습니다.

### `src/app/(auth)/login/login-form.tsx`
```typescript
{enabledProviders.kakao && (
  <button onClick={() => handleSocialLogin("kakao")}>
    카카오로 로그인
  </button>
)}
```
서버에서 `enabledProviders.kakao`가 `true`일 때만 버튼이 렌더링됩니다.

---

## 5. 도메인 구입과의 관계

**도메인 구입 전에도 카카오 로그인은 정상 동작합니다.** Vercel 기본 주소(`*.vercel.app`)도 카카오에서 정상 도메인으로 인정합니다.

### 나중에 커스텀 도메인을 사면

1. STEP 4의 **카카오 로그인 리다이렉트 URI**에 한 줄 추가:
   ```
   https://hra.kr/api/auth/callback/kakao
   ```
2. STEP 1의 **앱 대표 도메인**도 새 도메인으로 변경 (선택)
3. 기존 vercel.app URI는 유지하거나 삭제

---

## 6. 변경 이력

| 일자 | 변경 |
|---|---|
| 2026-04-26 | 카카오 콘솔 2025 개편을 반영하여 신규 작성. Playwright로 실제 콘솔 화면을 검증하여 위치를 확정함. |
