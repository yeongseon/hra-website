import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveGuide, resolveTemplate } from "@/lib/markdown/resolve";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  if (session.user.role === "PENDING") {
    return NextResponse.json(
      { message: "승인 대기 중입니다. 관리자 승인 후 이용해주세요." },
      { status: 403 },
    );
  }

  const { slug } = await params;
  const template = (await resolveTemplate(slug)) ?? (await resolveGuide(slug));

  if (!template) {
    return NextResponse.json({ message: "템플릿을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json(
    {
      body: template.body,
      title: template.title,
    },
    { status: 200 },
  );
}
