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
import Google from "next-auth/providers/google";
import Kakao from "next-auth/providers/kakao";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * ========================================
 * NextAuth 인증 시스템 설정
 * ========================================
 * 
 * 주요 설정:
 * 1. session.strategy: JWT 방식으로 세션 관리
 * 2. pages.signIn: 로그인 페이지 경로
 * 3. providers: 구글, 카카오 소셜 로그인
 * 4. callbacks: 로그인 과정 중 특정 시점에 실행되는 함수들
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    /**
     * 구글 로그인 프로바이더
     * 환경변수 AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET 필요
     * Google Cloud Console에서 OAuth 클라이언트를 생성해서 발급받습니다.
     */
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    /**
     * 카카오 로그인 프로바이더
     * 환경변수 AUTH_KAKAO_ID, AUTH_KAKAO_SECRET 필요
     * Kakao Developers에서 앱을 등록해서 발급받습니다.
     */
    Kakao({
      clientId: process.env.AUTH_KAKAO_ID!,
      clientSecret: process.env.AUTH_KAKAO_SECRET!,
    }),
  ],
  callbacks: {
    /**
     * signIn 콜백: 소셜 로그인 성공 후 DB에 사용자 저장
     * 
     * 소셜 로그인은 별도 회원가입 없이 처음 로그인하면 자동으로 계정이 생성됩니다.
     * 이미 있는 사용자면 그냥 로그인됩니다.
     */
    async signIn({ user, account }) {
      if (!account || !user.email) return false;

      const existingUser = await db.query.users.findFirst({
        where: eq(users.email, user.email),
      });

      if (!existingUser) {
        await db.insert(users).values({
          name: user.name || "이름 없음",
          email: user.email,
          image: user.image,
          role: "MEMBER",
        });
      } else if (user.image && existingUser.image !== user.image) {
        // 프로필 이미지가 변경된 경우 업데이트
        await db
          .update(users)
          .set({ image: user.image })
          .where(eq(users.email, user.email));
      }

      return true;
    },

    /**
     * jwt 콜백: JWT 토큰에 사용자 DB 정보 추가
     * 
     * 소셜 로그인은 외부 서비스에서 사용자 정보를 받아오므로,
     * 우리 DB에서 해당 사용자를 찾아 id와 role을 토큰에 추가합니다.
     */
    async jwt({ token, account }) {
      if (account && token.email) {
        const dbUser = await db.query.users.findFirst({
          where: eq(users.email, token.email),
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
        }
      }
      return token;
    },

    /**
     * session 콜백: 프론트엔드에서 접근할 수 있는 세션 정보 설정
     */
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "ADMIN" | "MEMBER";
      }
      return session;
    },

    /**
     * authorized 콜백: 페이지 접근 권한 확인
     */
    async authorized({ auth, request }) {
      const { pathname } = request.nextUrl;

      if (pathname.startsWith("/admin")) {
        return auth?.user?.role === "ADMIN";
      }

      if (pathname.startsWith("/class-logs")) {
        return !!auth?.user;
      }

      if (pathname.startsWith("/resources")) {
        return !!auth?.user;
      }

      if (pathname.startsWith("/mypage")) {
        return !!auth?.user;
      }

      return true;
    },
  },
});
