// @vitest-environment node
/**
 * 공지 상세 API가 공개 DTO·입력·404·장애 응답과 조회수 수명주기를 지키는지 검증합니다.
 * 실제 게시 상태·원자 SQL은 서비스/저장소 통합 테스트에서 별도로 확인합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ notice: vi.fn(), increment: vi.fn(), after: vi.fn(), log: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/features/notices/detail/service", () => ({
  getPublishedNoticeById: mocks.notice,
  incrementPublishedNoticeViewCount: mocks.increment,
}));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.log }));

import { GET } from "@/app/api/v1/notices/[id]/route";

const id = "11111111-1111-4111-8111-111111111111";
const callbacks: Array<() => Promise<void>> = [];
const request = (query = "") => new Request(`https://qa.invalid/api/v1/notices/${id}${query}`);
const context = (value = id) => ({ params: Promise.resolve({ id: value }) });

beforeEach(() => {
  vi.resetAllMocks();
  callbacks.length = 0;
  mocks.after.mockImplementation((callback: () => Promise<void>) => { callbacks.push(callback); });
  mocks.notice.mockResolvedValue({
    id, title: "공개 공지", content: "# 공개 본문", viewCount: 12,
    createdAt: new Date("2026-10-20T01:02:03.004Z"),
    status: "PUBLISHED", authorId: "22222222-2222-4222-8222-222222222222",
  });
  mocks.increment.mockResolvedValue(undefined);
});

it("공개 본문만 엄격 DTO로 반환하고 조회수 갱신은 응답 뒤 등록한다", async () => {
  const response = await GET(request(), context());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ notice: {
    id, title: "공개 공지", content: "# 공개 본문", viewCount: 12,
    createdAt: "2026-10-20T01:02:03.004Z",
  } });
  expect(mocks.increment).not.toHaveBeenCalled();
  expect(callbacks).toHaveLength(1);
  await callbacks[0]();
  expect(mocks.increment).toHaveBeenCalledExactlyOnceWith(id);
});

it.each(["bad-id", "", "00000000-0000-0000-0000-00000000000x"])("잘못된 ID %s를 DB 전에 거부한다", async (value) => {
  const response = await GET(request(), context(value));
  expect(response.status).toBe(400);
  expect((await response.json()).error.code).toBe("INVALID_INPUT");
  expect(mocks.notice).not.toHaveBeenCalled();
  expect(mocks.after).not.toHaveBeenCalled();
});

it("query가 있으면 400으로 거부한다", async () => {
  const response = await GET(request("?unused=1"), context());
  expect(response.status).toBe(400);
  expect(mocks.notice).not.toHaveBeenCalled();
});

it("없는 공지와 초안은 조회수 작업 없이 404로 끝난다", async () => {
  mocks.notice.mockResolvedValueOnce(null);
  const response = await GET(request(), context());
  expect(response.status).toBe(404);
  expect((await response.json()).error.code).toBe("NOT_FOUND");
  expect(mocks.after).not.toHaveBeenCalled();
});

it("저장소 실패는 원문을 숨긴 503으로 처리한다", async () => {
  mocks.notice.mockRejectedValueOnce(new Error("SELECT secret='synthetic@example.test'"));
  const response = await GET(request(), context());
  expect(response.status).toBe(503);
  const body = await response.json();
  expect(body.error.code).toBe("UNAVAILABLE");
  expect(JSON.stringify(body)).not.toMatch(/SELECT|synthetic@example/);
  expect(mocks.log).toHaveBeenCalledOnce();
  expect(mocks.after).not.toHaveBeenCalled();
});

it("조회수 SQL 실패는 응답을 바꾸지 않고 정제 로그로만 남긴다", async () => {
  mocks.increment.mockRejectedValueOnce(new Error("UPDATE secret='synthetic@example.test'"));
  const response = await GET(request(), context());
  expect(response.status).toBe(200);
  await expect(callbacks[0]()).resolves.toBeUndefined();
  expect(mocks.log).toHaveBeenCalledWith("api-v1/notices/detail/viewCount", expect.any(Error), {
    requestId: expect.any(String),
  });
});
