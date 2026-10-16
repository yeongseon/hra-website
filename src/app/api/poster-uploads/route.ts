/** 모집 포스터의 관리자 전용 업로드 토큰과 완료 콜백입니다 (#102). */
import { head } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod/v4";
import { posterImageRule, posterUploadPath, maxPosterImageBytes, posterUploadTargetId } from "@/lib/poster-upload-contract";
import { auth } from "@/lib/auth";
import { projectBlobHost } from "@/lib/blob-host";
import { logServerError } from "@/lib/errors";
import { isSameRequestOrigin } from "@/lib/request-origin";
import { isProjectBlobUrl } from "@/lib/resource-download";
import { recordResourceUpload } from "@/lib/resource-upload-server";

const requestSchema = z.object({ posterId: z.uuid(), uploadId: z.uuid(), fileName: z.string().min(1).max(255), size: z.number().int().positive().max(maxPosterImageBytes), contentType: z.string() });
const callbackSchema = requestSchema.pick({ posterId: true, uploadId: true, fileName: true, contentType: true }).extend({ userId: z.uuid(), pathname: z.string() });

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as HandleUploadBody;
    const result = await handleUpload({ body, request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const origin = request.headers.get("origin");
        if (origin && !isSameRequestOrigin(request)) throw new Error("허용되지 않은 요청입니다.");
        const session = await auth();
        if (!session?.user?.id || session.user.role !== "ADMIN") throw new Error("업로드 권한이 없습니다.");
        const parsed = requestSchema.safeParse(clientPayload ? JSON.parse(clientPayload) : null);
        if (!parsed.success || parsed.data.posterId !== posterUploadTargetId) throw new Error("포스터 정보가 올바르지 않습니다.");
        const rule = posterImageRule(parsed.data.fileName, parsed.data.contentType);
        if (!rule || pathname !== posterUploadPath(parsed.data.posterId, session.user.id, parsed.data.uploadId, rule.extension)) {
          throw new Error("업로드 경로가 올바르지 않습니다.");
        }
        // 콜백·저장 요청이 중단돼도 업로드를 추적할 수 있도록 토큰 발급 시 원장에 남깁니다.
        await recordResourceUpload(`https://${projectBlobHost}/${pathname}`, session.user.id);
        return { allowedContentTypes: [rule.contentType], maximumSizeInBytes: maxPosterImageBytes,
          validUntil: Date.now() + 15 * 60 * 1000, addRandomSuffix: false, allowOverwrite: false,
          tokenPayload: JSON.stringify({ ...parsed.data, userId: session.user.id, pathname }) };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const parsed = callbackSchema.safeParse(tokenPayload ? JSON.parse(tokenPayload) : null);
        if (!parsed.success || parsed.data.posterId !== posterUploadTargetId || !isProjectBlobUrl(blob.url)) throw new Error("완료 정보를 확인할 수 없습니다.");
        const rule = posterImageRule(parsed.data.fileName, parsed.data.contentType);
        if (!rule || parsed.data.pathname !== posterUploadPath(parsed.data.posterId, parsed.data.userId, parsed.data.uploadId, rule.extension) ||
            blob.pathname !== parsed.data.pathname) throw new Error("완료 경로가 일치하지 않습니다.");
        const stored = await head(blob.url);
        if (stored.url !== blob.url || stored.pathname !== blob.pathname || stored.size < 1 ||
            stored.size > maxPosterImageBytes || stored.contentType !== rule.contentType) throw new Error("사진 저장 정보를 확인할 수 없습니다.");
        await recordResourceUpload(blob.url, parsed.data.userId);
      },
    });
    return Response.json(result);
  } catch (error) {
    logServerError("api/poster-uploads", error);
    return Response.json({ error: "업로드 요청을 처리할 수 없습니다." }, { status: 400 });
  }
}
