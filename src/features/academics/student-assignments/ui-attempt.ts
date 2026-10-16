/** 업로드 재시도의 UUID·의도만 탭 저장소에 보존한다. 파일·파일명·계정 정보는 저장하지 않는다. */
import { z } from "zod/v4";
const schema = z.object({ requestId: z.uuid(), submissionKey: z.uuid(), uploadIntentId: z.uuid().optional() }).strict();
export type AssignmentAttempt = z.infer<typeof schema>;
export function readAssignmentAttempt(storage: Pick<Storage, "getItem">, key: string): AssignmentAttempt | null {
  try { const raw = storage.getItem(key); if (!raw) return null; const parsed = schema.safeParse(JSON.parse(raw)); return parsed.success ? parsed.data : null; }
  catch { return null; }
}
export function saveAssignmentAttempt(storage: Pick<Storage, "setItem">, key: string, value: AssignmentAttempt): boolean {
  try { storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
