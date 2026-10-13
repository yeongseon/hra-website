# 카카오 이메일 동의 및 기존 계정 주소 갱신

## 선행 설정

1. 카카오 개발자 콘솔의 **카카오 로그인 → 동의항목**에서 `account_email`을 사용할 수 있는 앱인지 확인한다. 카카오 정책상 이메일 동의 항목은 비즈니스 앱 또는 테스트 앱 권한이 필요하다.
2. `account_email`, `profile_nickname`, `profile_image` 동의 항목을 설정한다. 세 항목 중 하나라도 허용되지 않았다면 아래 환경변수를 켜지 않는다.
3. 실제 계정의 동의 화면에서 이메일 제공에 동의한다. 카카오 계정에 이메일이 없거나 동의하지 않은 경우에는 사이트가 실제 주소를 알 수 없다.

## 배포 설정과 확인

1. 동의 항목 설정이 끝난 뒤 Vercel Production 환경에 `AUTH_KAKAO_EMAIL_SCOPE=true`를 설정하고 다시 배포한다. 값을 설정하지 않으면 기존 카카오 인증 범위를 유지한다.
2. 이미 바인딩된 카카오 계정으로 다시 로그인해 마이페이지에서 실제 이메일을 확인한다. 로그인 콜백은 카카오 원본 응답의 이메일이 **유효하고 검증됨**으로 표시된 경우에만 기존 `@oauth.placeholder` 주소를 갱신한다.
3. 같은 이메일을 다른 사이트 계정이 사용 중이면 주소를 갱신하지 않고 기존 바인딩으로 로그인한다. 이메일만 같다는 이유로 계정을 연결하지 않는다.
4. 카카오에서 `invalid_scope`가 반환되면 해당 동의 항목 설정을 확인하고, 해결 전에는 환경변수를 제거하거나 `false`로 바꿔 재배포한다.

참고: [카카오 로그인 동의항목](https://developers.kakao.com/docs/en/kakaologin/prerequisite), [이메일 제공 조건](https://developers.kakao.com/docs/en/kakaologin/utilize), [추가 동의 요청](https://developers.kakao.com/docs/en/kakaologin/rest-api).
