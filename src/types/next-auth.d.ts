/**
 * ============================================
 * NextAuth 타입 선언 파일 (.d.ts)
 * ============================================
 * 
 * 🤔 .d.ts 파일이 뭔가요?
 * .d.ts는 "타입 선언 파일(Declaration File)"입니다.
 * TypeScript에게 "이 라이브러리에는 이런 타입들이 있어"라고 알려주는 파일입니다.
 * 마치 사전에서 단어의 뜻을 찾아보는 것처럼,
 * TypeScript가 이 파일을 보고 코드의 타입을 이해합니다.
 * 
 * 📝 왜 이 파일이 필요한가요?
 * NextAuth는 기본적으로 User와 Session 타입에 'role(역할)' 필드가 없습니다.
 * 하지만 우리 프로젝트에서는 관리자(ADMIN)와 일반회원(MEMBER)을 구분해야 합니다.
 * 이 파일에서 NextAuth의 기본 타입에 'role' 필드를 추가하는 것입니다.
 * 이렇게 하면 NextAuth를 사용하는 모든 곳에서 자동으로 role을 쓸 수 있습니다.
 * 
 * 🔧 "declare module"이 뭔가요?
 * "declare module"은 기존 라이브러리의 타입을 '확장(extend)'한다는 뜻입니다.
 * 원래 라이브러리 코드를 수정하지 않고도, 우리 프로젝트에서만 추가 타입을 쓸 수 있게 해줍니다.
 */

import "next-auth";

declare module "next-auth" {
  /**
   * 사용자 정보 타입 확장
   * 
   * NextAuth의 기본 User 타입에 'role'을 추가합니다.
   * 역할(role)은 사용자가 시스템에서 무엇을 할 수 있는지를 결정합니다:
   * - "ADMIN": 관리자 - 전체 관리 기능 사용 가능
    * - "MEMBER": 일반회원 - 수업일지 제출 등 기본 기능만 사용 가능
    */
  interface User {
    role: "ADMIN" | "MEMBER" | "PENDING";
  }

  /**
   * 세션 정보 타입 확장
   * 
   * 세션은 "사용자가 로그인한 상태"를 의미합니다.
   * 사용자가 로그인하면 session.user를 통해 그 사용자의 정보에 접근할 수 있습니다.
   * 여기서는 session.user에 다음 정보들을 추가합니다:
   * - id: 사용자의 고유 번호 (데이터베이스에서 사용)
    * - role: 사용자의 역할 (ADMIN 또는 MEMBER)
   * 
   * 예시: if (session.user.role === "ADMIN") { 관리자 기능 }
   */
  interface Session {
    user: User & {
      id: string;
      role: "ADMIN" | "MEMBER" | "PENDING";
    };
  }
}

/**
 * JWT 토큰 타입 확장
 * 
 * JWT(JSON Web Token)는 사용자 정보를 암호화해서 저장하는 방식입니다.
 * NextAuth는 JWT를 사용해 로그인 상태를 유지합니다.
 * 이 JWT 토큰에도 다음 정보들을 저장합니다:
 * - id: 사용자의 고유 번호
 * - role: 사용자의 역할
 * 
 * 이렇게 하면 서버에서 매번 데이터베이스를 조회하지 않고도
 * JWT 토큰에 저장된 정보로 빠르게 사용자를 인증할 수 있습니다.
 */
declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "ADMIN" | "MEMBER" | "PENDING";
  }
}
