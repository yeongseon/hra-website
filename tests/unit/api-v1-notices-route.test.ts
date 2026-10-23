// @vitest-environment node
/**
 * 공지 API v1의 Web 입력·응답 경계를 검증합니다.
 * 중복/미등록 query가 DB에 도달하지 않고 오류 원문·비공개 행 필드가 응답에 섞이지 않아야 합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";
import { apiV1ErrorResponseSchema, apiV1NoticeListResponseSchema } from "@hra/contracts/api-v1";

const mocks = vi.hoisted(() => ({ list: vi.fn(), log: vi.fn() }));
vi.mock("@/features/notices/public-list/service", () => ({ listPublishedNoticesForApi: mocks.list }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.log }));

import { GET } from "@/app/api/v1/notices/route";

const id = "11111111-1111-4111-8111-111111111111";
const createdAt = new Date("2026-10-20T01:02:03.004Z");
const updatedAt = new Date("2026-10-21T05:06:07.008Z");
const notice = {
  id, title: "합성 공지", excerpt: "공개 발췌", pinned: true, viewCount: 2,
  createdAt, updatedAt, content: "비공개 원문", authorId: "22222222-2222-4222-8222-222222222222",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.list.mockResolvedValue({ items: [notice], totalCount: 1 });
});

it("기본 공개 목록은 whitelist DTO와 UTC 시각·페이지 메타만 응답한다", async () => {
  const response = await GET(new Request("https://qa.invalid/api/v1/notices"));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.list).toHaveBeenCalledWith({ query: "", page: 1, pageSize: 10 });

  const body = await response.json();
  expect(apiV1NoticeListResponseSchema.parse(body)).toEqual(body);
  expect(body).toEqual({
    notices: [{
      id, title: "합성 공지", excerpt: "공개 발췌", pinned: true, viewCount: 2,
      createdAt: "2026-10-20T01:02:03.004Z", updatedAt: "2026-10-21T05:06:07.008Z",
    }],
    page: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1,
      hasNextPage: false, hasPreviousPage: false },
  });
  expect(JSON.stringify(body)).not.toContain("비공개 원문");
  expect(JSON.stringify(body)).not.toContain("authorId");
});

it("숫자 page/size와 trim된 검색어를 전달하고 범위 밖 목록도 요청 page를 유지한다", async () => {
  mocks.list.mockResolvedValueOnce({ items: [], totalCount: 12 });
  const response = await GET(new Request("https://qa.invalid/api/v1/notices?page=4&pageSize=5&q=%20%EB%AA%A8%EC%A7%91%20"));
  expect(response.status).toBe(200);
  expect(mocks.list).toHaveBeenCalledWith({ query: "모집", page: 4, pageSize: 5 });
  const body = await response.json();
  expect(body.notices).toEqual([]);
  expect(body.page).toEqual({ page: 4, pageSize: 5, totalCount: 12,
    totalPages: 3, hasNextPage: false, hasPreviousPage: true });
});

it.each([
  "?q=첫째&q=둘째",
  "?unknown=1",
  "?page=0",
  "?pageSize=51",
  `?q=${"가".repeat(101)}`,
  "?page=9007199254740991&pageSize=50",
])("잘못된 query %s는 서비스 전에 고정 400으로 거부한다", async (query) => {
  const response = await GET(new Request(`https://qa.invalid/api/v1/notices${query}`));
  expect(response.status).toBe(400);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = await response.json();
  expect(apiV1ErrorResponseSchema.parse(body)).toEqual(body);
  expect(body.error.code).toBe("INVALID_INPUT");
  expect(body.error.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.log).not.toHaveBeenCalled();
});

it("저장소 실패는 SQL·검색어를 응답에 반사하지 않고 고정 503으로 처리한다", async () => {
  mocks.list.mockRejectedValueOnce(new Error("SELECT private_email FROM users WHERE secret = '합성비밀'"));
  const response = await GET(new Request("https://qa.invalid/api/v1/notices?q=%ED%95%A9%EC%84%B1"));
  expect(response.status).toBe(503);
  const body = await response.json();
  expect(apiV1ErrorResponseSchema.parse(body)).toEqual(body);
  expect(body.error.code).toBe("UNAVAILABLE");
  expect(JSON.stringify(body)).not.toContain("SELECT");
  expect(JSON.stringify(body)).not.toContain("합성비밀");
  expect(mocks.log).toHaveBeenCalledOnce();
});
