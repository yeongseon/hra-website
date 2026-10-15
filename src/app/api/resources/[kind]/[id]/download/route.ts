/**
 * 승인된 회원에게 자료실 파일을 같은 출처로 스트리밍합니다.
 * 응답의 Content-Disposition에 DB의 원본 파일명을 넣어 한글 이름으로 저장합니다.
 */
import { get } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { classMaterialReadFilter } from "@/features/class-materials/access";
import { db } from "@/lib/db";
import { classLogImages, classMaterials, guidebooks, weeklyTextImages, weeklyTexts } from "@/lib/db/schema";
import { logServerError } from "@/lib/errors";
import { requireSharedResourceReader } from "@/lib/resource-access";
import { attachmentDisposition, resourceBlobAccess } from "@/lib/resource-download";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ kind: string; id: string }> };

export async function GET(request: Request, { params }: Context): Promise<Response> {
  const session = await requireSharedResourceReader();
  const { kind, id } = await params;
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return new Response("자료를 찾을 수 없습니다.", { status: 404 });

  let file: { fileUrl: string; fileName: string | null } | undefined;
  let image = false;
  if (kind === "class-materials") {
    [file] = await db.select({ fileUrl: classMaterials.fileUrl, fileName: classMaterials.fileName })
      .from(classMaterials)
      .where(and(eq(classMaterials.id, parsedId.data), classMaterialReadFilter(session.user)))
      .limit(1);
  } else if (kind === "guidebooks") {
    [file] = await db.select({ fileUrl: guidebooks.fileUrl, fileName: guidebooks.fileName })
      .from(guidebooks).where(eq(guidebooks.id, parsedId.data)).limit(1);
  } else if (kind === "weekly-texts") {
    [file] = await db.select({ fileUrl: weeklyTexts.fileUrl, fileName: weeklyTexts.fileName })
      .from(weeklyTexts).where(eq(weeklyTexts.id, parsedId.data)).limit(1);
  } else if (kind === "weekly-text-images") {
    const [row] = await db.select({ fileUrl: weeklyTextImages.url })
      .from(weeklyTextImages).where(eq(weeklyTextImages.id, parsedId.data)).limit(1);
    file = row ? { ...row, fileName: null } : undefined;
    image = true;
  } else if (kind === "class-log-images") {
    const [row] = await db.select({ fileUrl: classLogImages.url })
      .from(classLogImages).where(eq(classLogImages.id, parsedId.data)).limit(1);
    file = row ? { ...row, fileName: null } : undefined;
    image = true;
  } else {
    return new Response("자료를 찾을 수 없습니다.", { status: 404 });
  }

  const access = file?.fileUrl ? resourceBlobAccess(file.fileUrl) : null;
  if (!file?.fileUrl || !access) {
    return new Response("파일을 찾을 수 없습니다.", { status: 404 });
  }

  try {
    // 비공개 저장소의 URL은 DB에서만 읽으며, 서버 토큰은 브라우저로 보내지 않습니다.
    const privateToken = process.env.RESOURCE_PRIVATE_BLOB_TOKEN;
    if (access === "private" && !privateToken) {
      throw new Error("비공개 자료 저장소가 연결되지 않았습니다.");
    }
    const blob = access === "private"
      ? await get(file.fileUrl, {
          access: "private", token: privateToken,
          storeId: new URL(file.fileUrl).hostname.split(".")[0], useCache: false,
        })
      : await get(file.fileUrl, { access: "public" });
    if (!blob || blob.statusCode !== 200) {
      return new Response("파일을 찾을 수 없습니다.", { status: 404 });
    }
    const contentType = blob.blob.contentType || "application/octet-stream";
    if (image && !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(contentType)) {
      return new Response("파일을 찾을 수 없습니다.", { status: 404 });
    }
    const inlinePdf = !image && new URL(request.url).searchParams.get("inline") === "1" &&
      file.fileName?.toLowerCase().endsWith(".pdf") && contentType === "application/pdf";
    return new Response(blob.stream, {
      headers: {
        "Content-Type": contentType,
        ...(image ? {} : { "Content-Disposition": attachmentDisposition(file.fileName, inlinePdf) }),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logServerError("resources/download", error);
    return new Response("파일을 내려받을 수 없습니다.", { status: 502 });
  }
}
