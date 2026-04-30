import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }
    // 마크다운 이미지 업로드는 ADMIN/FACULTY만 허용 (MEMBER/PENDING 불가)
    if (session.user.role !== "ADMIN" && session.user.role !== "FACULTY") {
      return NextResponse.json(
        { error: "관리자 또는 교수진만 이미지를 업로드할 수 있습니다." },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 400 });
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "지원하지 않는 이미지 형식입니다. (jpg, png, webp, gif만 가능)" },
        { status: 400 }
      );
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "파일 크기는 10MB를 초과할 수 없습니다." },
        { status: 400 }
      );
    }

    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `markdown-images/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const blob = await put(fileName, file, { access: "public" });

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error("이미지 업로드 오류:", error);
    return NextResponse.json(
      { error: "이미지 업로드 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
