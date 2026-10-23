// @vitest-environment node
/**
 * 실제 구현하는 공지 목록 경로의 OpenAPI와 Zod 계약이 같은 공개 필드를 설명하는지 검증합니다.
 * 미구현 경로·내부 DB 필드·초과 페이지 크기를 계약에 조용히 포함하지 않습니다.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  API_V1_DEFAULT_PAGE_SIZE,
  API_V1_MAX_PAGE_SIZE,
  apiV1ErrorResponseSchema,
  apiV1NoticeListResponseSchema,
  apiV1NoticeSummarySchema,
  apiV1PageMetaSchema,
  toApiV1ErrorResponse,
  toApiV1PageMeta,
} from "@hra/contracts/api-v1";

const openapi = JSON.parse(readFileSync("packages/contracts/openapi.json", "utf8"));
const require = createRequire(import.meta.url);
const operation = openapi.paths["/api/v1/notices"].get;
const schemas = openapi.components.schemas;
const uuid = "44444444-4444-4444-8444-444444444444";

describe("#272 공개 공지 목록 OpenAPI 3.1 계약", () => {
  it("모든 참조가 같은 문서의 선언된 스키마를 가리킨다", () => {
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
      } else if (value !== null && typeof value === "object") {
        for (const [key, item] of Object.entries(value)) {
          if (key === "$ref") {
            expect(typeof item).toBe("string");
            if (typeof item === "string") {
              expect(item.startsWith("#/components/schemas/")).toBe(true);
              expect(Object.hasOwn(schemas, item.slice("#/components/schemas/".length))).toBe(true);
            }
          } else {
            visit(item);
          }
        }
      }
    };
    visit(openapi);
  });

  it("구현된 공지 GET과 query 제한을 정본에 기록한다", () => {
    expect(require.resolve("@hra/contracts/openapi.json")).toContain("packages/contracts/openapi.json");
    expect(openapi.openapi).toBe("3.1.1");
    expect(Object.keys(openapi.paths).sort()).toEqual(["/api/v1/me", "/api/v1/notices"]);
    expect(Object.keys(openapi.paths["/api/v1/notices"])).toEqual(["get"]);
    expect(operation.operationId).toBe("listPublishedNotices");

    const parameters = Object.fromEntries(operation.parameters.map((parameter: { name: string }) => [parameter.name, parameter]));
    expect(Object.keys(parameters).sort()).toEqual(["page", "pageSize", "q"]);
    expect(parameters.page).toMatchObject({ in: "query", required: false, schema: { type: "integer", minimum: 1, default: 1 } });
    expect(parameters.page.description).toContain("OFFSET");
    expect(parameters.pageSize).toMatchObject({
      in: "query", required: false,
      schema: { type: "integer", minimum: 1, maximum: API_V1_MAX_PAGE_SIZE, default: API_V1_DEFAULT_PAGE_SIZE },
    });
    expect(parameters.q).toMatchObject({ in: "query", required: false, schema: { type: "string", maxLength: 100 } });
    expect(operation.description).toMatch(/중복/);
    expect(operation.description).toMatch(/알 수 없/);
    expect(operation.description).toMatch(/범위를 넘/);
  });

  it("200/400/503 응답과 필수 DTO 필드가 Zod whitelist와 일치한다", () => {
    expect(Object.keys(operation.responses).sort()).toEqual(["200", "400", "503"]);
    expect(operation.responses["200"].content["application/json"].schema.$ref).toBe("#/components/schemas/NoticeListResponse");
    expect(operation.responses["400"].content["application/json"].schema.$ref).toBe("#/components/schemas/InvalidInputError");
    expect(operation.responses["503"].content["application/json"].schema.$ref).toBe("#/components/schemas/UnavailableError");

    expect([...schemas.NoticeListResponse.required].sort()).toEqual(Object.keys(apiV1NoticeListResponseSchema.shape).sort());
    expect([...schemas.NoticeSummary.required].sort()).toEqual(Object.keys(apiV1NoticeSummarySchema.shape).sort());
    expect([...schemas.PageMeta.required].sort()).toEqual(Object.keys(apiV1PageMetaSchema.shape).sort());
    for (const key of ["NoticeListResponse", "NoticeSummary", "PageMeta", "InvalidInputError", "UnavailableError"]) {
      expect(schemas[key].additionalProperties).toBe(false);
    }
    expect(schemas.NoticeListResponse.properties.notices.maxItems).toBe(API_V1_MAX_PAGE_SIZE);
    expect(schemas.UtcTimestamp.pattern).toContain("[.][0-9]{3}Z$");
    expect(schemas.InvalidInputError.properties.error.properties.code.const).toBe("INVALID_INPUT");
    expect(schemas.UnavailableError.properties.error.properties.code.const).toBe("UNAVAILABLE");
  });

  it("실제 응답 스키마는 본문·작성자·추가 필드와 50건 초과를 거부한다", () => {
    const notice = {
      id: uuid,
      title: "합성 공지",
      excerpt: "합성 발췌",
      pinned: false,
      viewCount: 0,
      createdAt: "2026-10-23T03:00:00.000Z",
      updatedAt: "2026-10-23T03:00:00.000Z",
    };
    const body = { notices: [notice], page: toApiV1PageMeta({ page: 2, pageSize: 10, totalCount: 25 }) };
    expect(apiV1NoticeListResponseSchema.parse(body)).toEqual(body);
    expect(apiV1NoticeListResponseSchema.safeParse({ ...body, notices: [{ ...notice, content: "비공개 원문" }] }).success).toBe(false);
    expect(apiV1NoticeListResponseSchema.safeParse({ ...body, authorId: uuid }).success).toBe(false);
    expect(apiV1NoticeListResponseSchema.safeParse({ ...body, notices: Array.from({ length: 51 }, () => notice) }).success).toBe(false);
    for (const code of ["INVALID_INPUT", "UNAVAILABLE"] as const) {
      const error = toApiV1ErrorResponse({ code, requestId: uuid });
      expect(apiV1ErrorResponseSchema.parse(error)).toEqual(error);
      expect(Object.keys(error.error).sort()).toEqual([...schemas.InvalidInputError.properties.error.required].sort());
    }
  });
});
