/**
 * ========================================
 * NextAuth 인증 시스템 설정 파일
 * ========================================
 * 
 * 이 파일은 사용자 로그인을 안전하게 관리하는 설정 파일입니다.
 * 
 * 주요 역할:
 * 1. 이메일/비밀번호 입력값 검증 (loginSchema)
 * 2. 로그인 시 데이터베이스에서 사용자 조회 (authorize 함수)
 * 3. 로그인 성공 후 JWT 토큰에 사용자 정보 저장 (jwt 콜백)
 * 4. 페이지 접근 권한 확인 (authorized 콜백)
 * 
 * 초보자 개념 설명:
 * - JWT: 로그인 성공 후 서버가 사용자 정보를 담은 암호화된 토큰을 줍니다.
 *   이 토큰은 클라이언트(브라우저)가 보관했다가 요청할 때마다 보냅니다.
 * - 콜백: 특정 상황이 발생했을 때 자동으로 실행되는 함수입니다.
 *   예) 로그인 성공 → jwt 콜백 실행 → session 콜백 실행
 */

// NextAuth 라이브러리: 로그인/로그아웃 기능을 쉽게 구현해주는 라이브러리
import NextAuth from "next-auth";
// Credentials 프로바이더: 이메일/비밀번호로 로그인하는 방식
import Credentials from "next-auth/providers/credentials";
// bcryptjs 라이브러리: 비밀번호를 암호화해서 안전하게 저장하고, 입력한 비밀번호와 비교
import { compare } from "bcryptjs";
// 데이터베이스 연결 객체: DB에 접근하기 위한 도구
import { db } from "@/lib/db";
// 데이터베이스 스키마: users 테이블의 구조를 정의한 것
import { users } from "@/lib/db/schema";
// eq 함수: Drizzle ORM에서 SQL의 WHERE 조건을 만들 때 사용 (users.email == email 처럼)
import { eq } from "drizzle-orm";
// Zod 라이브러리: 입력값이 올바른 형식인지 검증해주는 라이브러리
import { z } from "zod/v4";

/**
 * 로그인 입력값 검증 규칙
 * 사용자가 입력한 이메일과 비밀번호가 올바른 형식인지 확인합니다.
 * - email: 반드시 유효한 이메일 형식이어야 함 (예: user@example.com)
 * - password: 문자열이고 최소 6자 이상이어야 함
 */
const loginSchema = z.object({
  email: z.email(), // 유효한 이메일 형식 검증
  password: z.string().min(6), // 최소 6자 이상의 문자열
});

/**
 * ========================================
 * NextAuth 인증 시스템 설정
 * ========================================
 * 
 * NextAuth가 로그인/로그아웃을 어떻게 처리할지 설정하는 블록입니다.
 * 
 * 주요 설정:
 * 1. session.strategy: JWT 방식으로 세션 관리
 *    - JWT는 서버가 사용자 정보를 암호화해서 토큰으로 만들고,
 *      클라이언트(브라우저)가 이 토큰을 보관했다가 요청할 때마다 전송합니다.
 *    - 서버의 메모리에 세션 정보를 저장할 필요가 없어 확장성이 좋습니다.
 * 
 * 2. pages.signIn: 로그인 페이지 경로
 *    - 사용자가 로그인되지 않은 상태에서 보호된 페이지에 접근하면,
 *      자동으로 이 경로로 리다이렉트됩니다.
 * 
 * 3. providers: 로그인 방식 설정
 *    - Credentials: 이메일과 비밀번호로 직접 로그인
 *    - (구글/카카오 같은 OAuth는 여기에 추가할 수 있음)
 * 
 * 4. callbacks: 로그인 과정 중 특정 시점에 실행되는 함수들
 *    - jwt: 로그인 성공 후 JWT 토큰 생성
 *    - session: 프론트에서 접근할 수 있는 세션 정보 설정
 *    - authorized: 페이지 접근 권한 확인
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  // JWT 방식으로 세션 관리: 서버에 세션을 저장하지 않고, 암호화된 토큰을 사용
  session: { strategy: "jwt" },
  // 페이지 설정: 로그인 페이지의 경로
  pages: {
    signIn: "/login", // 로그인되지 않은 사용자는 /login으로 자동 이동
  },
  // 로그인 방식 설정
  providers: [
    /**
     * Credentials 프로바이더: 이메일/비밀번호 로그인
     * 
     * 사용자가 로그인 폼에서 이메일과 비밀번호를 입력하면:
     * 1. 입력값을 loginSchema로 검증
     * 2. 데이터베이스에서 해당 이메일의 사용자 조회
     * 3. 입력한 비밀번호와 DB에 저장된 암호화된 비밀번호 비교
     * 4. 일치하면 사용자 정보 반환 → JWT 토큰 생성
     */
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      /**
       * authorize: 로그인 검증 함수
       * 
       * 사용자가 입력한 이메일과 비밀번호를 검증해서,
       * 올바른 경우 사용자 정보를 반환합니다.
       * 잘못된 경우 null을 반환하면 로그인 실패입니다.
       */
      async authorize(credentials) {
        // 1단계: 입력값 검증 (이메일 형식, 비밀번호 길이 등)
        const parsed = loginSchema.safeParse(credentials);
        // 검증 실패 → 로그인 실패
        if (!parsed.success) return null;

        // 검증 성공한 데이터 추출
        const { email, password } = parsed.data;

        // 2단계: 데이터베이스에서 이메일로 사용자 조회
        const [user] = await db
          .select() // 모든 컬럼 선택
          .from(users) // users 테이블에서
          .where(eq(users.email, email)) // 이메일이 일치하는 행 찾기
          .limit(1); // 최대 1개 행만 가져오기

        // 해당 이메일의 사용자가 없으면 → 로그인 실패
        if (!user) return null;

        // 3단계: 입력한 비밀번호와 DB의 암호화된 비밀번호 비교
        // compare는 입력한 비밀번호를 같은 방식으로 암호화해서 DB의 것과 비교합니다
        const isValid = await compare(password, user.passwordHash);
        // 비밀번호 불일치 → 로그인 실패
        if (!isValid) return null;

        // 4단계: 로그인 성공! 사용자 정보 반환
        // 이 반환값이 jwt 콜백의 user 매개변수가 됩니다
        return {
          id: user.id, // 사용자 고유 ID
          name: user.name, // 사용자 이름
          email: user.email, // 사용자 이메일
          role: user.role, // 사용자 역할 (ADMIN 또는 MEMBER)
          image: user.image, // 사용자 프로필 이미지
        };
      },
    }),
  ],
  /**
   * Callbacks: 인증 프로세스의 특정 시점에서 자동으로 실행되는 함수들
   * 
   * 실행 순서:
   * 1. authorize 실행 → 사용자 정보 반환
   * 2. jwt 콜백 실행 → JWT 토큰에 사용자 정보 추가
   * 3. session 콜백 실행 → 세션 객체에 사용자 정보 추가
   * 4. authorized 콜백 실행 → 페이지 접근 권한 확인
   */
  callbacks: {
    /**
     * jwt 콜백: JWT 토큰 생성/업데이트 함수
     * 
     * 역할: 로그인 성공 후 만들어지는 JWT 토큰에 사용자 정보를 추가합니다.
     * 
     * 매개변수:
     * - token: JWT 토큰 (암호화되어 서버/클라이언트에 저장됨)
     * - user: authorize 함수에서 반환한 사용자 정보
     * 
     * 초보자 팁:
     * - 첫 로그인 시: user가 존재 → token에 id와 role 추가
     * - 이후 접근 시: user는 null → token의 기존 정보 유지
     */
    async jwt({ token, user }) {
      // user가 존재하면 (= 로그인 성공 시)
      if (user) {
        // 사용자 ID를 JWT 토큰에 추가
        token.id = user.id;
        // 사용자 역할(ADMIN/MEMBER)을 JWT 토큰에 추가
        token.role = (user as { role: string }).role;
      }
      // 업데이트된 토큰 반환
      return token;
    },

    /**
     * session 콜백: 세션 객체 설정 함수
     * 
     * 역할: 프론트엔드(리액트 컴포넌트)에서 접근할 수 있는 세션 정보를 설정합니다.
     * 
     * 매개변수:
     * - session: 프론트에 내려갈 세션 정보 객체
     * - token: JWT 콜백에서 만든 토큰 정보
     * 
     * 초보자 팁:
     * - session에 추가한 정보만 프론트에서 useSession()으로 접근 가능
     * - 보안: 민감한 정보(비밀번호 등)는 여기에 추가하지 마세요
     * - 프론트 예시: const { data: session } = useSession();
     *   console.log(session.user.id); // JWT에서 추가한 id
     *   console.log(session.user.role); // JWT에서 추가한 role
     */
    async session({ session, token }) {
      // session.user가 존재하면
      if (session.user) {
        // JWT 토큰에 저장된 사용자 ID를 세션에 추가
        session.user.id = token.id as string;
        // JWT 토큰에 저장된 역할을 세션에 추가
        session.user.role = token.role as "ADMIN" | "MEMBER";
      }
      // 업데이트된 세션 반환
      return session;
    },

    /**
     * authorized 콜백: 페이지 접근 권한 확인 함수
     * 
     * 역할: 사용자가 특정 페이지/API에 접근해도 되는지 권한을 확인합니다.
     * 이 함수가 false를 반환하면 접근이 거부되고 /login으로 이동합니다.
     * 
     * 매개변수:
     * - auth: 현재 로그인한 사용자 정보 (null이면 로그인 안 됨)
     * - request: 사용자의 요청 정보 (주소, 메서드 등)
     * 
     * 초보자 팁:
     * - 권한 레벨: 공개(누구나) > 회원(로그인 필수) > 관리자(ADMIN만)
     * - false 반환 → 접근 거부 → 자동으로 /login으로 리다이렉트
     * - true 반환 → 접근 허용
     */
    async authorized({ auth, request }) {
      const { pathname } = request.nextUrl; // 요청한 페이지 주소

      // /admin으로 시작하는 페이지: 관리자만 접근
      if (pathname.startsWith("/admin")) {
        // auth?.user?.role === "ADMIN"이 true면 접근 허용, false면 거부
        return auth?.user?.role === "ADMIN";
      }

      // /class-logs로 시작하는 페이지: 로그인한 사용자만 접근
      if (pathname.startsWith("/class-logs")) {
        // !!auth?.user는 로그인한 사용자면 true, 안 한 사용자면 false
        // (!! 연산자는 값을 boolean으로 변환)
        return !!auth?.user;
      }

      // 그 외 다른 페이지들: 모두 접근 허용 (공개 페이지)
      return true;
    },
  },
});
