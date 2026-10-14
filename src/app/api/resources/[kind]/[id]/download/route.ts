/**
 * 승인된 회원에게 자료실 파일을 같은 출처로 스트리밍합니다.
 * 응답의 Content-Disposition에 DB의 원본 파일명을 넣어 한글 이름으로 저장합니다.
 */
import { get } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { classMaterialReadFilter } from "@/features/class-materials/access";
import { db } from "@/lib/db";
import { classMaterials, guidebooks, weeklyTexts } from "@/lib/db/schema";
import { logServerError } from "@/lib/errors";
import { requireSharedResourceReader } from "@/lib/resource-access";
import { attachmentDisposition, isProjectBlobUrl } from "@/lib/resource-download";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ kind: string; id: string }> };

export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const session = await requireSharedResourceReader();
  const { kind, id } = await params;
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return new Response("자료를 찾을 수 없습니다.", { status: 404 });

  let file: { fileUrl: string; fileName: string | null } | undefined;
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
  } else {
    return new Response("자료를 찾을 수 없습니다.", { status: 404 });
  }

  if (!file?.fileUrl || !isProjectBlobUrl(file.fileUrl)) {
    return new Response("파일을 찾을 수 없습니다.", { status: 404 });
  }

  try {
    const blob = await get(file.fileUrl, { access: "public" });
    if (!blob || blob.statusCode !== 200) {
      return new Response("파일을 찾을 수 없습니다.", { status: 404 });
    }
    return new Response(blob.stream, {
      headers: {
        "Content-Type": blob.blob.contentType || "application/octet-stream",
        "Content-Disposition": attachmentDisposition(file.fileName),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logServerError("resources/download", error);
    return new Response("파일을 내려받을 수 없습니다.", { status: 502 });
  }
}
