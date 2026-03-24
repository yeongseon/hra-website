/**
 * ============================================
 * 회원가입 서버 액션 파일
 * ============================================
 * 
 * "use server"는 이 파일의 모든 함수들이 서버(백엔드)에서만 실행된다는 뜻입니다.
 * 클라이언트(사용자의 브라우저)에서 이 함수들을 직접 호출할 수 있지만,
 * 실제 코드는 보안이 좋은 서버에서 실행됩니다.
 * 
 * 예: 비밀번호 암호화, 데이터베이스 접근 등 민감한 작업은 서버에서만 해야 안전합니다.
 */

"use server";

import { hash } from "bcryptjs"; // 비밀번호를 암호화(해시)하는 라이브러리
import { db } from "@/lib/db"; // 데이터베이스 연결 객체
import { users } from "@/lib/db/schema"; // 데이터베이스의 users 테이블 정보
import { z } from "zod/v4"; // 입력값을 검증(확인)하는 라이브러리

/**
 * registerSchema: 회원가입 입력값 검증 규칙
 * 
 * Zod는 사용자가 입력한 데이터가 정말로 올바른 형식인지 확인해주는 라이브러리입니다.
 * 각 필드의 규칙을 정의하면, 나중에 safeParse()로 검증할 수 있습니다.
 */
const registerSchema = z
  .object({
    // name: 이름은 문자열이어야 하고, 최소 1글자 이상 필요
    name: z.string().min(1, "이름을 입력해주세요"),
    
    // email: 문자열이어야 하고, 올바른 이메일 형식(@가 포함되어야 함)
    email: z.string().email("올바른 이메일을 입력해주세요"),
    
    // password: 문자열이어야 하고, 최소 6자 이상이어야 함
    password: z.string().min(6, "비밀번호는 6자 이상이어야 합니다"),
    
    // confirmPassword: 비밀번호 확인 필드
    confirmPassword: z.string(),
  })
  // .refine(): 위의 기본 검증을 통과한 후, 추가 검증을 합니다.
  // 여기서는: password와 confirmPassword가 정확히 같은지 확인합니다.
  .refine((data) => data.password === data.confirmPassword, {
    message: "비밀번호가 일치하지 않습니다",
    path: ["confirmPassword"], // 에러 메시지가 confirmPassword 필드에 표시됨
  });

/**
 * registerUser: 회원가입을 처리하는 함수
 * 
 * 역할: 사용자가 입력한 정보를 받아서 데이터베이스에 새로운 사용자 계정을 만듭니다.
 * 매개변수: formData - HTML 폼에서 사용자가 입력한 데이터
 * 반환값: { success: true } 또는 { success: false, error: "에러 메시지" }
 */
export async function registerUser(formData: FormData) {
  // ========== 1단계: FormData에서 값 추출 ==========
  // FormData는 HTML 폼 데이터를 담는 객체입니다. get()으로 각 필드의 값을 꺼냅니다.
  const name = formData.get("name");
  const email = formData.get("email");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  // ========== 2단계: 입력값 검증 ==========
  // registerSchema를 사용하여 추출한 데이터가 규칙을 만족하는지 확인합니다.
  // safeParse()는 검증 결과를 { success, data, error } 형태로 반환합니다.
  const parsed = registerSchema.safeParse({
    name,
    email,
    password,
    confirmPassword,
  });

  // 검증에 실패한 경우: 첫 번째 에러 메시지를 반환
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "입력값을 확인해주세요",
    };
  }

  // 검증을 통과한 데이터를 변수에 저장 (더 명확한 이름으로 리네이밍)
  const { name: validatedName, email: validatedEmail, password: validatedPassword } = parsed.data;

  try {
    // ========== 3단계: 이메일 중복 확인 ==========
    // 데이터베이스의 users 테이블에서 같은 이메일을 가진 사용자가 있는지 검색합니다.
    const existingUser = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, validatedEmail),
    });

    // 같은 이메일이 이미 존재하면 회원가입 거부
    if (existingUser) {
      return {
        success: false,
        error: "이미 등록된 이메일입니다",
      };
    }

    // ========== 4단계: 비밀번호 암호화 (해시) ==========
    // 비밀번호를 평문으로 저장하면 보안에 위험합니다.
    // hash() 함수로 비밀번호를 암호화하여 저장합니다.
    // 10은 암호화 강도(숫자가 클수록 더 안전하지만 시간이 걸림)
    const passwordHash = await hash(validatedPassword, 10);

    // ========== 5단계: 데이터베이스에 새 사용자 저장 ==========
    // insert()로 새로운 행(사용자)을 users 테이블에 추가합니다.
    await db.insert(users).values({
      name: validatedName,
      email: validatedEmail,
      passwordHash, // 암호화된 비밀번호 저장
      role: "MEMBER", // 기본 역할은 일반 회원
    });

    // 성공적으로 저장되면 성공 응답 반환
    return { success: true };
  } catch (error) {
    // ========== 6단계: 에러 처리 ==========
    // 데이터베이스 오류나 예상치 못한 문제가 발생한 경우
    // 일반적인 에러 메시지를 반환합니다 (실제 오류는 서버 로그에 기록)
    return {
      success: false,
      error: "회원가입에 실패했습니다. 다시 시도해주세요.",
    };
  }
}
