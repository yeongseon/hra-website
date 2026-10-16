/**
 * 개인 제출 파일은 DB에서 인가·감사한 불투명 키로만 private Blob을 읽어 첨부 다운로드합니다.
 * 저장 키·URL·토큰·DB 오류 원문을 응답이나 실패 로그에 포함하지 않습니다.
 */
import "server-only";
import { get } from "@vercel/blob";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { academicSqlState, createAcademicObservation, type AcademicObservation, type AcademicOutcome } from "@/lib/academic-observability";
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
function protectedStream(source: ReadableStream<Uint8Array>, observation: AcademicObservation, expectedBytes: number): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let released = false;
  let terminal = false;
  let cancelled = false;
  let transferredBytes = 0;
  const release = () => { if (!released) { released = true; reader.releaseLock(); } };
  const finish = (outcome: AcademicOutcome) => {
    if (!terminal) { terminal = true; observation.emit(outcome, outcome === "STREAM_INTERRUPTED" ? { failureCode: "STREAM" } : {}); }
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (cancelled) return;
        if (next.done) {
          if (transferredBytes !== expectedBytes) throw new Error("파일 전송 크기가 일치하지 않습니다.");
          finish("COMPLETED");controller.close(); release();
        } else {
          transferredBytes += next.value.byteLength;
          if (transferredBytes > expectedBytes) throw new Error("파일 전송 크기가 일치하지 않습니다.");
          controller.enqueue(next.value);
        }
      } catch {
        if (cancelled) return;
        finish("STREAM_INTERRUPTED");
        controller.error(new Error("파일 전송이 중단되었습니다."));
        try { await reader.cancel(); }
        catch {
          // 실패는 이미 고정 이벤트로 남겼으므로 취소 오류 원문을 다시 전파하지 않습니다.
          return;
        } finally { release(); }
      }
    },
    async cancel() {
      if (terminal) return;
      cancelled = true;
      try { await reader.cancel();finish("CANCELLED"); }
      catch { finish("STREAM_INTERRUPTED"); }
      finally { release(); }
    },
  });
}

/** 잘못된 UUID·없는 행·다른 제출의 파일·소유권 거부는 같은 404 본문을 사용합니다. */
function failure(error: SubmissionFileAccessError, observation: AcademicObservation) {
  return new Response(error.message, { status: error.status,
    headers: { ...privateHeaders, "Content-Type": "text/plain; charset=utf-8", "X-Request-Id":observation.correlationId } });
}

/** params도 인증 이후 평가하며 소유권·감사 확정 전에는 Blob을 요청하지 않습니다. */
export async function downloadSubmissionFile(params: Promise<SubmissionFileParams>): Promise<Response> {
  const observation=createAcademicObservation("FILE_READ","SUBMISSION_FILE");
  try {
    const reader = await requireSubmissionFileReader();
    observation.authenticated(reader.userId);
    const parsed = identifiers.safeParse(await params);
    if (!parsed.success) throw new SubmissionFileAccessError("NOT_FOUND");
    observation.identify({resourceId:parsed.data.fileId});
    const result = await db.execute(buildAuthorizedSubmissionFileRead(reader, parsed.data.id, parsed.data.fileId));
    const row = result.rows[0];
    if (!row) throw new SubmissionFileAccessError("NOT_FOUND");
    const file = authorizedFile.parse(row);
    observation.identify({resourceId:parsed.data.fileId,requestId:file.access_id});
    observation.emit("AUTHORIZED");
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
    return new Response(protectedStream(blob.stream,observation,file.size_bytes), { headers: {
      ...privateHeaders, "Content-Type": "application/octet-stream",
      "Content-Disposition": attachmentDisposition(file.original_name), "Content-Length": String(file.size_bytes),
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "X-Request-Id":observation.correlationId,
    } });
  } catch (error) {
    const safe = error instanceof SubmissionFileAccessError ? error : new SubmissionFileAccessError("UNAVAILABLE");
    observation.emit(safe.status===503?"FAILED":"DENIED",{
      failureCode:safe.status===503?"STORAGE":"AUTHORIZATION",sqlState:academicSqlState(error),
    });
    return failure(safe,observation);
  }
}
