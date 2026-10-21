/**
 * ========================================
 * NextAuth 인증 시스템 설정 파일
 * ========================================
 * 
 * 이 파일은 사용자 로그인을 안전하게 관리하는 설정 파일입니다.
 * 
 * 주요 역할:
 * 1. 구글/카카오 소셜 로그인 (OAuth) 설정
 * 2. 소셜 로그인 시 데이터베이스에 사용자 자동 등록 (signIn 콜백)
 * 3. 로그인 성공 후 JWT 토큰에 사용자 정보 저장 (jwt 콜백)
 * 4. 페이지 접근 권한 확인 (authorized 콜백)
 * 
 * 초보자 개념 설명:
 * - OAuth: 구글이나 카카오 같은 외부 서비스를 통해 로그인하는 방식입니다.
 *   사용자가 비밀번호를 직접 만들 필요 없이, 구글/카카오 계정으로 바로 로그인합니다.
 * - JWT: 로그인 성공 후 서버가 사용자 정보를 담은 암호화된 토큰을 줍니다.
 * - 콜백: 특정 상황이 발생했을 때 자동으로 실행되는 함수입니다.
 */

import NextAuth from "next-auth";
import { canManageAcademics } from "@/lib/academic-access";
import type { Provider } from "next-auth/providers";
import { compare } from "bcryptjs";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { createKakaoProvider } from "@/lib/kakao-provider";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  isUserRole,
  isValidUuid,
  pickJwtLookupCriteria,
  resolveJwtSession,
} from "@/lib/auth-session";
import { createDrizzleSignInIO, handleOAuthSignIn } from "@/lib/auth-signin";
import { findCredentialUser } from "@/lib/auth-credentials";
import { releaseSuccessfulLogin, reserveLoginAttempt } from "@/lib/rate-limit";
import { extractClientIp } from "@/lib/rate-limit-core";

const MEMBER_ONLY_PREFIXES = ["/resources", "/member", "/mypage"] as const;

/**
 * Timing attack 방어용 dummy bcrypt hash (pre-computed 상수)
 *
 * 배경 (#71): credentials 로그인 시 이메일이 존재하지 않으면 bcrypt.compare 를 호출하지 않고
 *   즉시 null 을 반환하는 구조였다. 반면 이메일이 존재하면 bcrypt (cost 12, ~300ms) 를 수행하므로
 *   응답 시간 차이로 이메일 존재 여부를 통계적으로 추정할 수 있었다 (이메일 enumeration).
 *
 * 해결: 이메일이 없어도 항상 bcrypt.compare 를 실행하도록 dummy hash 를 준비한다.
 *
 * 왜 pre-computed 상수인가 (Oracle NIT):
 *   - hashSync("...", 12) 를 모듈 로드 시 실행하면 Vercel serverless 인스턴스가 cold start 될 때마다
 *     ~300ms CPU 를 소비한다. 다수의 콜드 스타트에서 누적되면 무의미한 비용이다.
 *   - dummy 값은 상수이며 재계산할 필요가 없으므로 사전에 1회 계산해 두고 하드코딩한다.
 *   - 생성 방법: `node -e "console.log(require('bcryptjs').hashSync('__hra_timing_attack_defense__', 12))"`
 *   - cost 12 는 seed-admin.mjs 및 실제 사용자 비밀번호와 동일해야 timing 이 일치한다 ($2b$12$... prefix 로 확인).
 *
 * 안전성: 이 dummy hash 는 실제 사용자 레코드에 매칭되지 않으며,
 *   authorize() 에서 `if (!user || !user.passwordHash || !isValid) return null` 로 최종 차단된다.
 */
const DUMMY_PASSWORD_HASH =
  "$2b$12$z/qEe8YYHyxXWQv8pJpxgOM8sLEXLWOmxou0re9M1IkPPhMYHyd32";

/**
 * 활성화할 로그인 프로바이더 목록을 동적으로 구성합니다.
 *
 * 환경변수가 설정된 소셜 로그인만 providers 배열에 추가합니다.
 * 환경변수가 없으면 해당 소셜 로그인은 비활성화되고,
 * NextAuth 초기화 시 에러도 발생하지 않습니다.
 */
const providers: Provider[] = [];

// 구글 로그인: AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET 둘 다 있어야 활성화
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  );
}

// 카카오 로그인: ID와 SECRET이 모두 있어야 활성화한다.
// 이메일 동의 항목을 카카오 콘솔에서 허용한 뒤에만 AUTH_KAKAO_EMAIL_SCOPE=true로 범위를 요청한다.
if (process.env.AUTH_KAKAO_ID && process.env.AUTH_KAKAO_SECRET) {
  providers.push(
    createKakaoProvider(
      process.env.AUTH_KAKAO_ID,
      process.env.AUTH_KAKAO_SECRET,
      process.env.AUTH_KAKAO_EMAIL_SCOPE === "true",
    ),
  );
}

/**
 * 이메일/비밀번호 로그인 프로바이더 (항상 활성화)
 *
 * 이 방식은 OAuth(구글/카카오)와 달리, 우리 DB에 저장된 비밀번호 해시를 직접 검증합니다.
 * 비밀번호 원문은 절대 DB에 저장하지 않고, bcrypt 해시(passwordHash)와 비교해서 로그인 여부를 판단합니다.
 *
 * 동작 순서:
 * 1) 사용자가 입력한 이메일/비밀번호를 받습니다.
 * 2) 이메일로 사용자를 조회합니다.
 * 3) 저장된 passwordHash와 입력 비밀번호를 compare로 검증합니다.
 * 4) 검증 성공 시 NextAuth 세션 생성을 위해 사용자 정보를 반환합니다.
 */
providers.push(
  Credentials({
    credentials: {
      email: { label: "이메일", type: "email" },
      password: { label: "비밀번호", type: "password" },
    },
    async authorize(credentials, request) {
      if (!credentials?.email || !credentials?.password) return null;
      if (
        typeof credentials.email !== "string" ||
        typeof credentials.password !== "string"
      ) {
        return null;
      }

      // bcrypt 실행 전에 조합·IP·이메일 제한을 원자적으로 예약합니다 (#121).
      // 동시 요청도 예약된 실패 시도를 보므로 상한을 넘어 인증할 수 없습니다.
      const ip = extractClientIp(request.headers);
      const reservation = await reserveLoginAttempt(ip, credentials.email);

      const user = await findCredentialUser(credentials.email);

      // Timing attack 방어 (#71): 이메일 존재 여부와 무관하게 항상 bcrypt.compare 를 실행하여
      // 응답 시간 차이로 이메일 enumeration 이 되지 않도록 한다.
      // blocked=true 여도 여전히 실행: 429 응답이 아니라 null 을 반환할 계획이므로
      // 응답 시간 균일화를 유지하려면 bcrypt 는 항상 돌아야 한다.
      const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
      const isValid = await compare(credentials.password, passwordHash);

      const authSucceeded = !!user && !!user.passwordHash && isValid;

      // 성공한 예약은 제거해 기존의 실패 시도 기반 잠금 정책을 유지합니다.
      if (authSucceeded && !reservation.blocked) {
        await releaseSuccessfulLogin(reservation.reservationId);
      }

      if (reservation.blocked || !authSucceeded) return null;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
      };
    },
  }),
);

/**
 * 프론트엔드(로그인 페이지)에서 어떤 소셜 로그인 버튼을 표시할지 결정하기 위한 플래그
 *
 * 서버 컴포넌트에서 이 값을 읽어 클라이언트에 전달하면,
 * 로그인 페이지에서 환경변수가 없는 소셜 로그인 버튼을 숨길 수 있습니다.
 */
export const enabledProviders = {
  google: !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  kakao: !!(process.env.AUTH_KAKAO_ID && process.env.AUTH_KAKAO_SECRET),
};

/**
 * OAuth signIn 콜백 본체를 실제 drizzle DB 로 실행시키는 어댑터 (#67, #81).
 *
 * signIn 콜백 자체는 auth.ts 최상단에서 NextAuth() 초기화 안에 익명 async 함수로
 * 들어 있어 vitest 에서 격리 import 가 불가능하다. 그래서 결정 트리와 IO 조합은
 * `handleOAuthSignIn` (src/lib/auth-signin.ts) 로 이동시켰고, 그 함수는 DB IO 를
 * `SignInIO` 포트로 주입받는다. 이 상수는 프로덕션 어댑터 (drizzle 실행) 이며,
 * 단위 테스트는 vi.fn() 으로 SignInIO 각 메서드를 mock 해서 signIn 콜백의 IO 조합
 * 자체를 회귀 검증한다.
 */
const signInIO = createDrizzleSignInIO(db);

/**
 * ========================================
 * NextAuth 인증 시스템 설정
 * ========================================
 *
 * 주요 설정:
 * 1. session.strategy: JWT 방식으로 세션 관리
 * 2. pages.signIn: 로그인 페이지 경로
 * 3. providers: 환경변수에 따라 동적으로 구성된 로그인 방식
 * 4. callbacks: 로그인 과정 중 특정 시점에 실행되는 함수들
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    // OAuth 실패도 한국어 오류 안내를 제공하는 공개 로그인 화면으로 보냅니다.
    error: "/login",
  },
  providers,
  callbacks: {
    /**
     * signIn 콜백: OAuth 로그인 처리 및 신규 계정 생성.
     *
     * 콜백 본체는 `handleOAuthSignIn` (src/lib/auth-signin.ts) 로 격리되어 있다.
     * 그 함수는 DB IO 를 `SignInIO` 포트로 주입받으므로, 이 콜백에서 CI 회귀 검증
     * 대상인 IO 조합 (dual SELECT / INSERT/UPDATE 분기 / redirect string / user.email
     * mutation) 을 vitest 에서 mock 으로 확인할 수 있다.
     *
     * 격리한 이유 (#81):
     *   auth.ts 는 모듈 로드 시점에 NextAuth() 를 호출하므로, vitest 에서 이 파일을
     *   import 하면 next-auth 내부의 next/server 참조가 module resolution 을 깨뜨린다.
     *   콜백 본체를 독립 모듈로 분리하면 auth.ts 를 import 하지 않고도 로직을 테스트할
     *   수 있고, 회귀 방지가 CI 로 강제된다.
     *
     * 결정 트리 및 불변식은 handleOAuthSignIn 문서와 decideOAuthSignIn 문서를 참조.
     * `signInIO` 는 위 모듈 스코프에서 초기화된 drizzle 어댑터이다.
     */
    async signIn({ user, account, profile }) {
      if (account?.provider === "credentials") return true;
      if (!account) return false;
      return handleOAuthSignIn({ user, account, profile }, signInIO);
    },

    /**
     * jwt 콜백: JWT 토큰에 사용자 DB 정보 추가 및 세션 무효화 판단 (#68, #74)
     *
     * 세션 무효화 판단은 pure helper `resolveJwtSession` 에 위임하여 단위 테스트로 회귀 검증한다.
     * DB 조회 대상은 pure helper `pickJwtLookupCriteria` 가 결정한다.
     *   - 로그인 직후 (account 가 넘어오는 유일한 시점): OAuth 는 (provider, providerAccountId)
     *     binding 튜플, credentials 는 authorize() 가 반환한 DB id.
     *   - 이후 요청: token.id.
     *   email 로는 조회하지 않는다 — signIn 콜백이 인가한 row 와 세션이 가리키는 row 가
     *   달라지는 것 (계정 뒤바뀜) 을 막기 위함이다.
     *
     * 성능 (#74): findFirst 의 `columns` 를 명시하여 passwordHash/image 등 불필요한 컬럼을
     *   전송하지 않는다. Neon serverless 커넥션 오버헤드는 남지만 payload·역직렬화 비용을 줄인다.
     */
    async jwt({ token, user, account }) {
      const criteria = pickJwtLookupCriteria(
        token,
        account
          ? {
              type: account.type,
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              userId: user?.id,
            }
          : null,
      );
      if (!criteria) {
        return null;
      }

      const dbUser = await db.query.users.findFirst({
        where:
          criteria.by === "id"
            ? eq(users.id, criteria.value)
            : and(
                eq(users.oauthProvider, criteria.provider),
                eq(users.oauthProviderAccountId, criteria.providerAccountId),
              ),
        columns: {
          id: true,
          role: true,
          name: true,
          sessionVersion: true,
        },
      });

      return resolveJwtSession(token, dbUser);
    },

    /**
     * session 콜백: 프론트엔드에서 접근할 수 있는 세션 정보 설정
     *
     * 보안 (#75): id 와 role 은 원자적으로 검증한다. session.user.id 는 서버 액션에서
     *   `authorId: session.user.id` (INSERT) 및 `where(users.id, session.user.id)` (SELECT) 로
     *   직접 사용되고 users.id 는 Postgres UUID 컬럼이므로, UUID 형식이 아닌 값이 흘러가면
     *   invalid_input_syntax 오류나 조용한 빈 조회로 이어진다. 따라서 id 가 UUID 형식이 아니면
     *   role 도 신뢰하지 않고 PENDING 으로 강등하여 authorization 층에서 차단되게 한다.
     *   실제 방어 경로는 아래 세 곳이며, 이 fallback 은 최종 안전망 역할이다.
     *     1) authorized() 콜백 (아래 정의): PENDING 을 /admin, /resources, /member, /mypage 에서 차단
     *     2) requireAdmin() (src/lib/admin.ts): ADMIN 이 아니면 즉시 거부
     *     3) 각 member 서버 액션: role 화이트리스트로 사전 차단
     */
    async session({ session, token }) {
      if (session.user) {
        if (isValidUuid(token.id)) {
          session.user.id = token.id;
          session.user.role = isUserRole(token.role) ? token.role : "PENDING";
        } else {
          session.user.id = "";
          session.user.role = "PENDING";
        }
        if (typeof token.name === "string") {
          session.user.name = token.name;
        }
      }
      return session;
    },

    /**
     * authorized 콜백: 페이지 접근 권한 확인
     */
    async authorized({ auth, request }) {
      const { pathname } = request.nextUrl;

      if (pathname === "/admin/login") {
        return true;
      }

      // 학사관리 경로만 지정 승인자에게 열며 일반 홈페이지 관리자 권한은 그대로 분리한다.
      if (pathname === "/admin/academics" || pathname.startsWith("/admin/academics/")) {
        if (!auth?.user) {
          const loginUrl = new URL("/login", request.url);
          loginUrl.searchParams.set("callbackUrl", pathname);
          return Response.redirect(loginUrl);
        }
        if (auth.user.role === "PENDING") {
          return Response.redirect(new URL("/pending", request.url));
        }
        if (!canManageAcademics(auth.user)) {
          // 사용자 middleware가 있으면 Auth.js가 false를 직접 차단하지 않으므로 응답으로 거부한다.
          return new Response("학사 운영 책임자만 접근할 수 있습니다.", {
            status: 403,
            headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
          });
        }
        return true;
      }

      if (pathname.startsWith("/admin")) {
        if (!auth?.user) {
          const loginUrl = new URL("/admin/login", request.url);
          loginUrl.searchParams.set("callbackUrl", pathname);
          return Response.redirect(loginUrl);
        }

        if (auth.user.role !== "ADMIN") {
          // 사용자 middleware가 실행되는 래퍼에서도 로그인한 사용자의 권한 부족을 명시적으로 거부한다.
          return new Response("관리자만 접근할 수 있습니다.", {
            status: 403,
            headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
          });
        }
        return true;
      }

      if (MEMBER_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
        if (!auth?.user) {
          // 요청 쿼리의 callbackUrl을 신뢰하지 않고 현재 내부 경로만 로그인 복귀 대상으로 전달한다.
          const loginUrl = new URL("/login", request.url);
          loginUrl.searchParams.set("callbackUrl", pathname);
          return Response.redirect(loginUrl);
        }

        if (auth.user.role === "PENDING") {
          return Response.redirect(new URL("/pending", request.url));
        }

        if (auth.user.role !== "MEMBER" && auth.user.role !== "ADMIN" && auth.user.role !== "FACULTY") {
          // 세션의 역할 검증과 별개로 이 경계에서도 허용 목록 밖의 역할은 응답으로 차단한다.
          return new Response("승인된 회원만 접근할 수 있습니다.", {
            status: 403,
            headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
          });
        }
        return true;
      }

      return true;
    },
  },
});
