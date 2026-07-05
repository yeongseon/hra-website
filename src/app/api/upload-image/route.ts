import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logServerError } from "@/lib/errors";
import {
  checkUploadRateLimit,
  recordUploadAttempt,
} from "@/lib/rate-limit";
import { extractClientIp } from "@/lib/rate-limit-core";

// 매직 바이트 (파일 헤더의 고유 시그니처) 로 실제 이미지 타입을 판별.
// 클라이언트가 보낸 file.type / 확장자 는 위조 가능하므로 신뢰하지 않는다.
// 반환값은 서버가 부여하는 canonical 확장자 (null 이면 허용된 이미지 형식이 아님).
function detectImageType(header: Uint8Array): "jpg" | "png" | "webp" | "gif" | null {
  // JPEG: FF D8 FF
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return "jpg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a
  )
    return "png";
  // GIF: 47 49 46 38 (37|39) 61 — "GIF87a" or "GIF89a"
  if (
    header[0] === 0x47 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x38 &&
    (header[4] === 0x37 || header[4] === 0x39) &&
    header[5] === 0x61
  )
    return "gif";
  // WebP: RIFF????WEBP — bytes 0-3 = "RIFF", bytes 8-11 = "WEBP"
  if (
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
  )
    return "webp";
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }
    // PENDING(승인 대기) 계정은 이미지 업로드 불가 — 승인 완료(MEMBER 이상)만 허용
    if (session.user.role === "PENDING") {
      return NextResponse.json(
        { error: "승인된 회원만 이미지를 업로드할 수 있습니다." },
        { status: 403 }
      );
    }

    // Rate limit (#69): 인증·역할 검사 통과 후 IP 기준 60초 / 30회.
    // 인증 이후에 두는 이유: 미인증 요청까지 카운트하면 세션 만료 반복과 실제
    // abuse 를 구분할 수 없다. formData() 이전에 두는 이유: 파일 전체를
    // 메모리로 로드하기 전에 차단해 리소스 소비를 최소화.
    // 실패 검증 (매직바이트, put 오류) 도 카운트해야 잘못된 파일 스팸으로
    // sliding window 를 우회하는 걸 막을 수 있어 record 를 검증 전에 호출한다.
    // 차단된 (429) 시도 역시 record 해 sliding window 를 정상적으로 소진하도록
    // 유지 — 기록하지 않으면 공격자가 무한 요청으로 로그를 우회할 수 있고,
    // Retry-After 로 사용자에게 안내한 대기시간이 실제 만료되지 않는다.
    // (recordLoginAttempt 와 동일 정책; 소스 auth.ts:credentials.authorize.)
    const ip = extractClientIp(request.headers);
    const { blocked, retryAfterSec } = await checkUploadRateLimit(ip);
    if (blocked) {
      await recordUploadAttempt(ip);
      return NextResponse.json(
        { error: "업로드 요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSec) },
        },
      );
    }
    await recordUploadAttempt(ip);

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 400 });
    }

    // 크기 검증 먼저 — 추가 검사 전에 조기 차단
    // (multipart 업로드 자체는 이미 formData() 시점에 받아진 상태 — 네트워크 절감이 아니라 로직 단순화 목적)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "파일 크기는 10MB를 초과할 수 없습니다." },
        { status: 400 }
      );
    }

    // 매직 바이트 검사 — 클라이언트가 위조 가능한 file.type 대신 실제 바이트로 검증
    // (SVG 는 시그니처가 없어 자동으로 배제됨 — 활성 콘텐츠 XSS 방어)
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const detectedExt = detectImageType(header);
    if (!detectedExt) {
      return NextResponse.json(
        { error: "지원하지 않는 이미지 형식입니다. (jpg, png, webp, gif만 가능)" },
        { status: 400 }
      );
    }

    // Blob 파일명은 서버에서만 생성 (사용자 입력 배제 — path traversal 및 잘못된 확장자 차단)
    const fileName = `markdown-images/${Date.now()}-${Math.random().toString(36).slice(2)}.${detectedExt}`;
    const blob = await put(fileName, file, { access: "public" });

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    logServerError("api/upload-image", error);
    return NextResponse.json(
      { error: "이미지 업로드 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
