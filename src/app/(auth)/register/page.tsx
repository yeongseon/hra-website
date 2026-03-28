/**
 * 회원가입 페이지 → 로그인 페이지로 리다이렉트
 * 
 * 소셜 로그인(구글/카카오)을 사용하므로 별도의 회원가입이 필요 없습니다.
 * 이 페이지에 접근하면 자동으로 로그인 페이지로 이동합니다.
 */
import { redirect } from "next/navigation";

export default function RegisterPage() {
  redirect("/login");
}
