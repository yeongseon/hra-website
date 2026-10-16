/**
 * 개인 제출 파일은 DB에서 인가·감사한 불투명 키로만 private Blob을 읽어 첨부 다운로드합니다.
 * 저장 키·URL·토큰·DB 오류 원문을 응답이나 실패 로그에 포함하지 않습니다.
 */
import "server-only";
import { get } from "@vercel/blob";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { logServerError } from "@/lib/errors";
import { attachmentDisposition } from "@/lib/resource-download";
import { buildAuthorizedSubmissionFileRead } from "./data";
import { requireSubmissionFileReader, SubmissionFileAccessError } from "./access";

export type SubmissionFileParams = { id: string; fileId: string };
const identifiers = z.object({ id: z.uuid(), fileId: z.uuid() });
// 저장 경로는 #151의 업로드 계약과 동일하며 URL·다른 접두어·경로 조작을 모두 거부합니다.
const storageKey = /^academic-uploads\/v1\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/document\.pdf$/;
const authorizedFile = z.object({
  storage_key: z.string().regex(storageKey), original_name: z.string().min(1).max(255),
  mime_type: z.literal("application/pdf"), size_bytes: z.number().int().min(1).max(52_428_800),
  checksum: z.string().regex(/^[0-9a-f]{64}$/), access_id: z.uuid(),
});
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/** SDK가 토큰에서 저장소를 다시 결정하므로 반환 객체의 실제 호스트와 경로도 대조합니다. */
function matchesSubmissionBlob(blob: { url: string; pathname: string }, host: string, key: string): boolean {
  try {
    const url = new URL(blob.url);
    // DNS 호스트는 대소문자를 구분하지 않지만 경로와 명시 포트는 그대로 대조합니다.
    // SDK가 토큰의 저장소 ID 대소문자를 URL에 보존해도 정상 파일을 거부하지 않습니다.
    const raw = /^https:\/\/([^/]+)(\/[^?#]*)$/.exec(blob.url);
    return url.protocol === "https:" && url.hostname === host && !url.port &&
      !url.username && !url.password && !url.search && !url.hash &&
      url.pathname === `/${key}` && blob.pathname === key &&
      raw?.[1].toLowerCase() === host && raw?.[2] === `/${key}`;
  } catch { return false; }
}

/** 응답 시작 후의 공급자 스트림 오류도 URL·키·토큰이 없는 고정 오류로 바꿉니다. */
function protectedStream(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let released = false;
  const release = () => { if (!released) { released = true; reader.releaseLock(); } };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) { controller.close(); release(); }
        else controller.enqueue(next.value);
      } catch {
        logServerError("academic-submission-files/stream", new Error("과제 파일 전송이 중단되었습니다."));
        controller.error(new Error("파일 전송이 중단되었습니다."));
        release();
      }
    },
    async cancel() {
      try { await reader.cancel(); }
      catch { logServerError("academic-submission-files/cancel", new Error("과제 파일 전송을 종료하지 못했습니다.")); }
      finally { release(); }
    },
  });
}

/** 잘못된 UUID·없는 행·다른 제출의 파일·소유권 거부는 같은 404 본문을 사용합니다. */
function failure(error: SubmissionFileAccessError) {
  return new Response(error.message, { status: error.status,
    headers: { ...privateHeaders, "Content-Type": "text/plain; charset=utf-8" } });
}

/** params도 인증 이후 평가하며 소유권·감사 확정 전에는 Blob을 요청하지 않습니다. */
export async function downloadSubmissionFile(params: Promise<SubmissionFileParams>): Promise<Response> {
  try {
    const reader = await requireSubmissionFileReader();
    const parsed = identifiers.safeParse(await params);
    if (!parsed.success) throw new SubmissionFileAccessError("NOT_FOUND");
    const result = await db.execute(buildAuthorizedSubmissionFileRead(reader, parsed.data.id, parsed.data.fileId));
    const row = result.rows[0];
    if (!row) throw new SubmissionFileAccessError("NOT_FOUND");
    const file = authorizedFile.parse(row);
    const host = process.env.ACADEMIC_SUBMISSION_BLOB_HOST;
    const token = process.env.ACADEMIC_SUBMISSION_READ_WRITE_TOKEN;
    if (!host || !/^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/.test(host) || !token) {
      throw new SubmissionFileAccessError("UNAVAILABLE");
    }
    const blob = await get(file.storage_key, {
      access: "private", token, storeId: host.split(".")[0], useCache: false,
    });
    if (!blob || blob.statusCode !== 200) throw new SubmissionFileAccessError("UNAVAILABLE");
    if (!matchesSubmissionBlob(blob.blob, host, file.storage_key) || blob.blob.size !== file.size_bytes ||
        blob.blob.contentType.split(";", 1)[0].trim().toLowerCase() !== "application/pdf") {
      await blob.stream.cancel();
      throw new SubmissionFileAccessError("UNAVAILABLE");
    }
    return new Response(protectedStream(blob.stream), { headers: {
      ...privateHeaders, "Content-Type": "application/octet-stream",
      "Content-Disposition": attachmentDisposition(file.original_name), "Content-Length": String(file.size_bytes),
      "Content-Security-Policy": "sandbox; default-src 'none'",
    } });
  } catch (error) {
    const safe = error instanceof SubmissionFileAccessError ? error : new SubmissionFileAccessError("UNAVAILABLE");
    if (safe.status === 503) {
      // 원래 예외에는 SQL·저장 키·토큰이 있을 수 있어 원인을 붙이지 않은 고정 Error만 기록합니다.
      logServerError("academic-submission-files/download", new Error("과제 파일 전달을 완료하지 못했습니다."));
    }
    return failure(safe);
  }
}
