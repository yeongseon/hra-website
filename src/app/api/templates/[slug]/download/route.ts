/**
 * 보고서 양식 마크다운 다운로드 API
 *
 * 역할: /api/templates/[slug]/download 요청 시 해당 양식의 마크다운 내용을
 *       .md 파일로 반환한다. DB 등록 양식 우선, 없으면 content/ 파일로 fallback.
 *
 * 사용 위치: 자료실 가이드북 탭의 보고서 양식 다운로드 링크
 * 권한: 로그인 필요 (MEMBER 이상)
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveTemplate, resolveGuide } from "@/lib/markdown/resolve";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  // 로그인 확인 — 비회원 접근 차단
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("로그인이 필요합니다.", { status: 401 });
  }

  const { slug } = await params;

  // 양식(template) 먼저 시도, 없으면 가이드(guide)로 fallback
  const template = await resolveTemplate(slug) ?? await resolveGuide(slug);

  if (!template) {
    return new NextResponse("양식을 찾을 수 없습니다.", { status: 404 });
  }

  // 파일명: 제목 기반으로 생성, 특수문자 제거
  const safeTitle = template.title.replace(/[^\w가-힣\s-]/g, "").trim().replace(/\s+/g, "-");
  const fileName = `${safeTitle}.md`;

  return new NextResponse(template.body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
