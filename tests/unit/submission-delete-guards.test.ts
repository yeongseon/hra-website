/** #193 마이그레이션 전에는 상위 항목 삭제를 막는 DB 상태 검사를 확인합니다. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { execute: mocks.execute } }));

import { hasSubmissionDeleteGuards } from "@/lib/db/submission-delete-guards";

beforeEach(() => vi.clearAllMocks());

describe("지원서 삭제 보호 제약 상태", () => {
  it("두 외래키 모두 RESTRICT일 때만 삭제를 허용한다", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [{ protected_count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ protected_count: 2 }] });
    expect(await hasSubmissionDeleteGuards()).toBe(false);
    expect(await hasSubmissionDeleteGuards()).toBe(true);
  });
});
