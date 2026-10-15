/** 관리자 주차별 텍스트 사진의 직접 업로드 토큰·완료 콜백입니다 (#102). */
import { head } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod/v4";
import { auth } from "@/lib/auth";
import { logServerError } from "@/lib/errors";
import { isCurrentResourceUploadUrl, resourceUploadStore } from "@/lib/resource-blob-store";
import { recordResourceUpload } from "@/lib/resource-upload-server";
import { galleryImageRule, maxGalleryImageBytes } from "@/lib/gallery-upload-contract";
import { weeklyTextImagePath } from "@/lib/weekly-text-image-upload-contract";

const requestSchema = z.object({ requestId: z.uuid(), uploadId: z.uuid(), fileName: z.string().min(1).max(255), size: z.number().int().positive().max(maxGalleryImageBytes), contentType: z.string() });
const callbackSchema = requestSchema.pick({ requestId: true, uploadId: true, fileName: true, contentType: true }).extend({ userId: z.uuid(), pathname: z.string() });

/** 토큰 발급 경로와 브라우저의 업로드 접근 모드를 맞춥니다. */
export async function GET(): Promise<Response> {
  try {
    return Response.json({ access: resourceUploadStore().access }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "업로드 저장소를 사용할 수 없습니다." }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as HandleUploadBody;
    const store = resourceUploadStore();
    const result = await handleUpload({ body, request, ...(store.token ? { token: store.token } : {}),
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(request.url).origin) throw new Error("허용되지 않은 요청입니다.");
        const session = await auth();
        if (!session?.user?.id || session.user.role !== "ADMIN") throw new Error("업로드 권한이 없습니다.");
        const parsed = requestSchema.safeParse(clientPayload ? JSON.parse(clientPayload) : null);
        if (!parsed.success) throw new Error("사진 정보가 올바르지 않습니다.");
        const rule = galleryImageRule(parsed.data.fileName, parsed.data.contentType);
        if (!rule || pathname !== weeklyTextImagePath(parsed.data.requestId, session.user.id, parsed.data.uploadId, rule.extension)) {
          throw new Error("업로드 경로가 올바르지 않습니다.");
        }
        await recordResourceUpload(`https://${store.host}/${pathname}`, session.user.id);
        return { allowedContentTypes: [rule.contentType], maximumSizeInBytes: maxGalleryImageBytes,
          validUntil: Date.now() + 15 * 60 * 1000, addRandomSuffix: false, allowOverwrite: false,
          tokenPayload: JSON.stringify({ ...parsed.data, userId: session.user.id, pathname }) };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const parsed = callbackSchema.safeParse(tokenPayload ? JSON.parse(tokenPayload) : null);
        if (!parsed.success || !isCurrentResourceUploadUrl(blob.url)) throw new Error("완료 정보를 확인할 수 없습니다.");
        const rule = galleryImageRule(parsed.data.fileName, parsed.data.contentType);
        if (!rule || parsed.data.pathname !== weeklyTextImagePath(parsed.data.requestId, parsed.data.userId, parsed.data.uploadId, rule.extension) ||
            blob.pathname !== parsed.data.pathname) throw new Error("완료 경로가 일치하지 않습니다.");
        const stored = await head(blob.url, store.token ? { token: store.token } : undefined);
        if (stored.url !== blob.url || stored.pathname !== blob.pathname || stored.size < 1 ||
            stored.size > maxGalleryImageBytes || stored.contentType !== rule.contentType) throw new Error("사진 저장 정보를 확인할 수 없습니다.");
        await recordResourceUpload(blob.url, parsed.data.userId);
      },
    });
    return Response.json(result);
  } catch (error) {
    logServerError("api/weekly-text-image-uploads", error);
    return Response.json({ error: "업로드 요청을 처리할 수 없습니다." }, { status: 400 });
  }
}
