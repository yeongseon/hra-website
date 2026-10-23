// @vitest-environment node
/**
 * 발행 공지 상세 GET의 OpenAPI와 공용 DTO·오류 계약을 대조합니다.
 * 초안과 내부 작성자 정보가 공개 응답에 섞이지 않도록 허용 필드를 확인합니다.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  apiV1ErrorResponseSchema,
  apiV1NoticeDetailResponseSchema,
  toApiV1ErrorResponse,
  toApiV1NoticeDetailResponse,
} from "@hra/contracts/api-v1";

const openapi = JSON.parse(readFileSync("packages/contracts/openapi.json", "utf8"));
const operation = openapi.paths["/api/v1/notices/{id}"].get;
const schemas = openapi.components.schemas;
const id = "11111111-1111-4111-8111-111111111111";

describe("#272 공개 공지 상세 OpenAPI 3.1 계약", () => {
  it("GET 한 경로와 필수 UUID path param만 추가하고 초안·query 입력을 거부한다고 설명한다", () => {
    expect(openapi.openapi).toBe("3.1.1");
    expect(Object.keys(openapi.paths).sort()).toEqual([
      "/api/v1/me", "/api/v1/notices", "/api/v1/notices/{id}", "/api/v1/schedule",
    ]);
    expect(Object.keys(openapi.paths["/api/v1/notices/{id}"])).toEqual(["get"]);
    expect(operation.operationId).toBe("getPublishedNoticeDetail");
    expect(operation.parameters).toEqual([
      expect.objectContaining({
        name: "id", in: "path", required: true,
        schema: { type: "string", format: "uuid" },
      }),
    ]);
    expect(operation.description).toContain("발행 상태인 공지만");
    expect(operation.description).toContain("query key는 허용하지 않습니다");
    expect(operation.responses["404"].description).toContain("발행되지 않음");
  });

  it("200·400·404·503은 정확한 DTO·고정 오류 코드와 no-store를 문서화한다", () => {
    const responseSchemas = {
      "200": "NoticeDetailResponse",
      "400": "InvalidInputError",
      "404": "NotFoundError",
      "503": "UnavailableError",
    } as const;
    expect(Object.keys(operation.responses).sort()).toEqual(Object.keys(responseSchemas).sort());
    for (const [status, name] of Object.entries(responseSchemas)) {
      const response = operation.responses[status];
      expect(response.content["application/json"].schema.$ref).toBe(`#/components/schemas/${name}`);
      expect(response.headers["Cache-Control"].schema).toEqual({ type: "string", const: "no-store" });
    }
    expect(schemas.NotFoundError.additionalProperties).toBe(false);
    expect(schemas.NotFoundError.properties.error.additionalProperties).toBe(false);
    expect(schemas.NotFoundError.properties.error.properties.code.const).toBe("NOT_FOUND");
    for (const [status, code] of [
      ["400", "INVALID_INPUT"], ["404", "NOT_FOUND"], ["503", "UNAVAILABLE"],
    ] as const) {
      const error = toApiV1ErrorResponse({ code, requestId: id });
      expect(apiV1ErrorResponseSchema.parse(error)).toEqual(error);
      const name = operation.responses[status].content["application/json"].schema.$ref.split("/").at(-1);
      expect(schemas[name].properties.error.properties.code.const).toBe(code);
    }
  });

  it("공지 본문 5필드만 UTC 밀리초 시각으로 반환하고 DB 내부 필드를 제거한다", () => {
    expect(schemas.NoticeDetailResponse.additionalProperties).toBe(false);
    expect(schemas.NoticeDetail.additionalProperties).toBe(false);
    expect(schemas.NoticeDetailResponse.required).toEqual(Object.keys(apiV1NoticeDetailResponseSchema.shape));
    expect([...schemas.NoticeDetail.required].sort()).toEqual(
      Object.keys(apiV1NoticeDetailResponseSchema.shape.notice.shape).sort(),
    );
    expect(Object.keys(schemas.NoticeDetail.properties).sort()).toEqual([...schemas.NoticeDetail.required].sort());
    expect(schemas.NoticeDetail.properties.createdAt.$ref).toBe("#/components/schemas/UtcTimestamp");
    expect(schemas.UtcTimestamp.pattern).toContain("[.][0-9]{3}Z$");

    const source = {
      id,
      title: "합성 공지",
      content: "# 합성 본문",
      viewCount: 3,
      createdAt: new Date("2026-10-23T14:30:00.000Z"),
      authorId: id,
      status: "PUBLISHED",
      pinned: true,
      updatedAt: new Date("2026-10-23T15:30:00.000Z"),
    };
    const response = toApiV1NoticeDetailResponse(source);
    expect(response).toEqual({
      notice: {
        id, title: "합성 공지", content: "# 합성 본문", viewCount: 3,
        createdAt: "2026-10-23T14:30:00.000Z",
      },
    });
    expect(apiV1NoticeDetailResponseSchema.parse(response)).toEqual(response);
    for (const extra of [
      { authorId: id }, { status: "DRAFT" }, { pinned: true },
      { previousNotice: { id, title: "이전" } }, { nextNotice: { id, title: "다음" } },
    ]) {
      expect(apiV1NoticeDetailResponseSchema.safeParse({ notice: { ...response.notice, ...extra } }).success).toBe(false);
    }
    expect(apiV1NoticeDetailResponseSchema.safeParse({ ...response, internal: true }).success).toBe(false);
    expect(apiV1NoticeDetailResponseSchema.safeParse({ notice: { ...response.notice, viewCount: -1 } }).success).toBe(false);
    expect(apiV1NoticeDetailResponseSchema.safeParse({ notice: { ...response.notice, createdAt: "2026-10-23" } }).success).toBe(false);
  });
});
