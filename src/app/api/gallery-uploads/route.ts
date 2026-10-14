/** 갤러리 이미지의 관리자 전용 직접 업로드 토큰·완료 콜백입니다 (#102). */
import { head } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { auth } from "@/lib/auth";
import { projectBlobHost } from "@/lib/blob-host";
import { db } from "@/lib/db";
import { galleries } from "@/lib/db/schema";
import { logServerError } from "@/lib/errors";
import { galleryImageRule, galleryUploadPath, maxGalleryImageBytes } from "@/lib/gallery-upload-contract";
import { isProjectBlobUrl } from "@/lib/resource-download";
import { recordResourceUpload } from "@/lib/resource-upload-server";

const requestSchema = z.object({ galleryId: z.uuid(), uploadId: z.uuid(), fileName: z.string().min(1).max(255), size: z.number().int().positive().max(maxGalleryImageBytes), contentType: z.string() });
const callbackSchema = requestSchema.pick({ galleryId: true, uploadId: true, fileName: true, contentType: true }).extend({ userId: z.uuid(), pathname: z.string() });

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as HandleUploadBody;
    const result = await handleUpload({ body, request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(request.url).origin) throw new Error("허용되지 않은 요청입니다.");
        const session = await auth();
        if (!session?.user?.id || session.user.role !== "ADMIN") throw new Error("업로드 권한이 없습니다.");
        const parsed = requestSchema.safeParse(clientPayload ? JSON.parse(clientPayload) : null);
        if (!parsed.success) throw new Error("파일 정보가 올바르지 않습니다.");
        const rule = galleryImageRule(parsed.data.fileName, parsed.data.contentType);
        if (!rule) throw new Error("이미지 형식이 올바르지 않습니다.");
        const expectedPath = galleryUploadPath(parsed.data.galleryId, session.user.id, parsed.data.uploadId, rule.extension);
        if (pathname !== expectedPath) throw new Error("업로드 대상이 올바르지 않습니다.");
        const gallery = await db.query.galleries.findFirst({ where: eq(galleries.id, parsed.data.galleryId), columns: { id: true } });
        if (!gallery) throw new Error("앨범을 찾을 수 없습니다.");
        await recordResourceUpload(`https://${projectBlobHost}/${pathname}`, session.user.id);
        return { allowedContentTypes: [rule.contentType], maximumSizeInBytes: maxGalleryImageBytes,
          validUntil: Date.now() + 15 * 60 * 1000, addRandomSuffix: false, allowOverwrite: false,
          tokenPayload: JSON.stringify({ ...parsed.data, userId: session.user.id, pathname }) };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const parsed = callbackSchema.safeParse(tokenPayload ? JSON.parse(tokenPayload) : null);
        if (!parsed.success || !isProjectBlobUrl(blob.url)) throw new Error("완료 정보를 확인할 수 없습니다.");
        const rule = galleryImageRule(parsed.data.fileName, parsed.data.contentType);
        if (!rule || parsed.data.pathname !== galleryUploadPath(parsed.data.galleryId, parsed.data.userId, parsed.data.uploadId, rule.extension) ||
            blob.pathname !== parsed.data.pathname) throw new Error("완료 경로가 일치하지 않습니다.");
        const stored = await head(blob.url);
        if (stored.url !== blob.url || stored.pathname !== blob.pathname || stored.size < 1 ||
            stored.size > maxGalleryImageBytes || stored.contentType !== rule.contentType) throw new Error("파일 저장 정보를 확인할 수 없습니다.");
        await recordResourceUpload(blob.url, parsed.data.userId);
      },
    });
    return Response.json(result);
  } catch (error) {
    logServerError("api/gallery-uploads", error);
    return Response.json({ error: "업로드 요청을 처리할 수 없습니다." }, { status: 400 });
  }
}
