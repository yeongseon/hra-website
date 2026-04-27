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
import type { Provider } from "next-auth/providers";
import { compare } from "bcryptjs";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Kakao from "next-auth/providers/kakao";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const MEMBER_ONLY_PREFIXES = ["/resources", "/member", "/mypage"] as const;

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

// 카카오 로그인: AUTH_KAKAO_ID, AUTH_KAKAO_SECRET 둘 다 있어야 활성화
// scope에 profile_nickname, profile_image를 명시해야 카카오가 닉네임·프로필 사진 동의를 요청함
// 기본 authorization URL의 scope가 비어있어서 nickname이 undefined로 오는 버그 수정
if (process.env.AUTH_KAKAO_ID && process.env.AUTH_KAKAO_SECRET) {
  providers.push(
    Kakao({
      clientId: process.env.AUTH_KAKAO_ID,
      clientSecret: process.env.AUTH_KAKAO_SECRET,
      authorization:
        "https://kauth.kakao.com/oauth/authorize?scope=profile_nickname+profile_image",
    }),
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
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null;
      if (
        typeof credentials.email !== "string" ||
        typeof credentials.password !== "string"
      ) {
        return null;
      }

      const user = await db.query.users.findFirst({
        where: eq(users.email, credentials.email),
      });

      if (!user || !user.passwordHash) return null;

      const isValid = await compare(credentials.password, user.passwordHash);
      if (!isValid) return null;

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
  },
  providers,
  callbacks: {
    /**
     * signIn 콜백: 소셜 로그인 성공 후 DB에 사용자 저장
     * 
     * 소셜 로그인은 별도 회원가입 없이 처음 로그인하면 자동으로 계정이 생성됩니다.
     * 이미 있는 사용자면 그냥 로그인됩니다.
     */
    async signIn({ user, account }) {
      if (account?.provider === "credentials") return true;

      if (!account) return false;

      // 카카오는 비즈앱 심사 없이 이메일을 제공하지 않음
      // 이메일이 없는 경우 provider + 고유 ID 조합으로 placeholder 이메일 생성
      const email =
        user.email || `${account.provider}_${account.providerAccountId}@oauth.placeholder`;

      const existingUser = await db.query.users.findFirst({
        where: eq(users.email, email),
      });

      if (!existingUser) {
         await db.insert(users).values({
           name:
             user.name?.trim() ||
             (account.provider === "kakao" ? "카카오 사용자" : "구글 사용자"),
           email,
           image: user.image,
           role: "PENDING",
         });
      } else {
        // 기존 사용자: 소셜 프로필에서 이름/이미지가 변경되었으면 DB에도 반영
        const updates: Partial<{ name: string; image: string }> = {};
        if (user.name && existingUser.name !== user.name) {
          updates.name = user.name;
        }
        if (user.image && existingUser.image !== user.image) {
          updates.image = user.image;
        }
        if (Object.keys(updates).length > 0) {
          await db
            .update(users)
            .set(updates)
            .where(eq(users.email, email));
        }
      }

      // NextAuth가 jwt 콜백에서 email로 DB 조회할 수 있도록 user.email 설정
      user.email = email;

      return true;
    },

    /**
     * jwt 콜백: JWT 토큰에 사용자 DB 정보 추가
     * 
     * 소셜 로그인은 외부 서비스에서 사용자 정보를 받아오므로,
     * 우리 DB에서 해당 사용자를 찾아 id와 role을 토큰에 추가합니다.
     */
    async jwt({ token }) {
      if (!token.email) {
        return token;
      }

      const dbUser = await db.query.users.findFirst({
        where: eq(users.email, token.email),
      });

      if (dbUser) {
        token.id = dbUser.id;
        token.role = dbUser.role;
        token.name = dbUser.name;
      }

      return token;
    },

    /**
     * session 콜백: 프론트엔드에서 접근할 수 있는 세션 정보 설정
     */
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
         session.user.role = token.role as "ADMIN" | "MEMBER" | "PENDING";
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

      if (pathname.startsWith("/admin")) {
        if (!auth?.user) {
          const loginUrl = new URL("/admin/login", request.url);
          loginUrl.searchParams.set("callbackUrl", pathname);
          return Response.redirect(loginUrl);
        }

        return auth?.user?.role === "ADMIN";
      }

       if (MEMBER_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
         if (!auth?.user) {
           return false;
         }

         if (auth.user.role === "PENDING") {
           return Response.redirect(new URL("/pending", request.url));
         }

         return auth.user.role === "MEMBER" || auth.user.role === "ADMIN";
       }

      return true;
    },
  },
});
