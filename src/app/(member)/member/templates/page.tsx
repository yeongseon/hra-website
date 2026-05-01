/**
 * 보고서 양식 목록 페이지 — /resources 자료실로 통합됨
 *
 * 역할: /member/templates 접근 시 /resources 로 리다이렉트.
 *       기존 북마크/링크 호환성 유지.
 */

import { redirect } from "next/navigation";

export default function MemberTemplatesPage() {
  redirect("/resources");
}
