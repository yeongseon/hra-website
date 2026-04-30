import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    // 1. 로그인 및 권한 확인 (관리자/멤버)
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    // 2. FormData에서 파일 추출
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 400 });
    }

    // 3. 이미지 파일 형식 검증
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "지원하지 않는 이미지 형식입니다. (jpg, png, webp, gif만 가능)" },
        { status: 400 }
      );
    }

    // 4. 파일 크기 제한 검증 (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "파일 크기는 10MB를 초과할 수 없습니다." },
        { status: 400 }
      );
    }

    // 5. Vercel Blob 업로드
    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `markdown-images/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const blob = await put(fileName, file, { access: "public" });

    // 6. 성공 시 이미지 URL 반환
    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error("이미지 업로드 오류:", error);
    return NextResponse.json(
      { error: "이미지 업로드 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
