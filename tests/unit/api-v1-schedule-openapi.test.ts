// @vitest-environment node
/**
 * 공개 월별 일정의 OpenAPI와 공용 Zod 계약이 동일한 입력·출력 경계를 설명하는지 검증합니다.
 * 한국 달력 벽시계 시각과 비공개 기수·교수 내부 필드의 노출 차단을 확인합니다.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { apiV1ScheduleQuerySchema, apiV1ScheduleResponseSchema } from "@hra/contracts/api-v1";

const openapi = JSON.parse(readFileSync("packages/contracts/openapi.json", "utf8"));
const operation = openapi.paths["/api/v1/schedule"].get;
const schemas = openapi.components.schemas;
const id = "11111111-1111-4111-8111-111111111111";

const validResponse = {
  year: 2026,
  month: 10,
  timeZone: "Asia/Seoul",
  events: [{
    id,
    calendarDate: "2026-10-23",
    startTime: "23:30",
    endTime: null,
    eventType: "CLASS",
    title: "합성 공개 수업",
    weekNumber: 4,
    description: null,
    cohort: { id, name: "합성 기수" },
    sessions: [{
      category: "CLASSICS",
      content: null,
      reportCategory: null,
      subTitle: null,
      subDescription: null,
      faculty: { id, name: "합성 교수" },
      order: 0,
    }],
  }],
} as const;

describe("#272 공개 일정 OpenAPI 3.1 계약", () => {
  it("구현된 GET 경로만 추가하고 필수 year/month의 범위와 중복·미등록 key 거부를 기록한다", () => {
    expect(openapi.openapi).toBe("3.1.1");
    expect(Object.keys(openapi.paths).sort()).toEqual(["/api/v1/me", "/api/v1/notices", "/api/v1/notices/{id}", "/api/v1/schedule"]);
    expect(Object.keys(openapi.paths["/api/v1/schedule"])).toEqual(["get"]);
    expect(operation.operationId).toBe("listPublicScheduleMonth");
    expect(operation.description).toMatch(/중복/);
    expect(operation.description).toMatch(/알 수 없/);
    expect(operation.parameters).toEqual([
      expect.objectContaining({ name: "year", in: "query", required: true,
        schema: { type: "integer", minimum: 1900, maximum: 2100 } }),
      expect.objectContaining({ name: "month", in: "query", required: true,
        schema: { type: "integer", minimum: 1, maximum: 12 } }),
    ]);
    expect(apiV1ScheduleQuerySchema.parse({ year: "2026", month: "10" })).toEqual({ year: 2026, month: 10 });
    for (const invalid of [
      {}, { year: "2026" }, { month: "10" }, { year: "1899", month: "10" },
      { year: "2101", month: "10" }, { year: "2026", month: "0" },
      { year: "2026", month: "13" }, { year: "2026.5", month: "10" },
      { year: "2026", month: "10", secret: "값" },
    ]) {
      expect(apiV1ScheduleQuerySchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("200·400·503과 no-store 헤더 및 참조된 응답·오류 스키마를 고정한다", () => {
    expect(Object.keys(operation.responses).sort()).toEqual(["200", "400", "503"]);
    for (const [status, schema] of Object.entries({
      "200": "ScheduleResponse", "400": "InvalidInputError", "503": "UnavailableError",
    })) {
      const response = operation.responses[status];
      expect(response.content["application/json"].schema.$ref).toBe(`#/components/schemas/${schema}`);
      expect(response.headers["Cache-Control"].schema).toEqual({ type: "string", const: "no-store" });
    }
    expect(schemas.InvalidInputError.properties.error.properties.code.const).toBe("INVALID_INPUT");
    expect(schemas.UnavailableError.properties.error.properties.code.const).toBe("UNAVAILABLE");
  });

  it("공개 DTO의 모든 객체가 엄격하고 KST 날짜·벽시계 시각을 UTC timestamp로 설명하지 않는다", () => {
    expect([...schemas.ScheduleResponse.required].sort()).toEqual(Object.keys(apiV1ScheduleResponseSchema.shape).sort());
    expect([...schemas.ScheduleEvent.required].sort()).toEqual(
      Object.keys(apiV1ScheduleResponseSchema.shape.events.element.shape).sort(),
    );
    for (const name of ["ScheduleResponse", "ScheduleEvent", "ScheduleSession", "ScheduleNamedReference"]) {
      expect(schemas[name].additionalProperties).toBe(false);
      expect(Object.keys(schemas[name].properties).sort()).toEqual([...schemas[name].required].sort());
    }
    expect(schemas.ScheduleResponse.properties.timeZone.const).toBe("Asia/Seoul");
    expect(schemas.ScheduleCalendarDate.format).toBe("date");
    expect(schemas.ScheduleWallTime.pattern).toBe("^([01][0-9]|2[0-3]):[0-5][0-9]$");
    expect(operation.description).toContain("UTC wire timestamp가 아닙니다");
    expect(schemas.ScheduleEvent.properties.startTime.$ref).toBe("#/components/schemas/ScheduleWallTime");
    expect(schemas.ScheduleEvent.properties.calendarDate.$ref).toBe("#/components/schemas/ScheduleCalendarDate");
    expect(schemas.ScheduleEvent.properties.endTime.description).toContain("종료 날짜");
    expect(apiV1ScheduleResponseSchema.parse(validResponse)).toEqual(validResponse);
    for (const invalidTime of ["24:00", "23:60", "9:30", "23:30:00", "23:30Z", "2026-10-23T23:30:00.000Z"]) {
      expect(apiV1ScheduleResponseSchema.safeParse({
        ...validResponse, events: [{ ...validResponse.events[0], startTime: invalidTime }],
      }).success).toBe(false);
    }
    expect(apiV1ScheduleResponseSchema.safeParse({
      ...validResponse, events: [{ ...validResponse.events[0], calendarDate: "2026-10-32" }],
    }).success).toBe(false);
  });

  it("기수 시트·신청 URL, 교수 내부 열과 임의 추가 필드를 거부한다", () => {
    const event = validResponse.events[0];
    const session = event.sessions[0];
    const invalidResponses = [
      { ...validResponse, internal: true },
      { ...validResponse, events: [{ ...event, isPublic: false }] },
      { ...validResponse, events: [{ ...event, cohort: { ...event.cohort, applicationFormUrl: "https://example.test/private" } }] },
      { ...validResponse, events: [{ ...event, cohort: { ...event.cohort, sheetId: "private-sheet" } }] },
      { ...validResponse, events: [{ ...event, sessions: [{ ...session, faculty: { ...session.faculty, email: "private@example.test" } }] }] },
      { ...validResponse, events: [{ ...event, sessions: [{ ...session, facultyId: id }] }] },
    ];
    for (const response of invalidResponses) {
      expect(apiV1ScheduleResponseSchema.safeParse(response).success).toBe(false);
    }
    expect(schemas.ScheduleNamedReference.required).toEqual(["id", "name"]);
    expect(Object.keys(schemas.ScheduleSession.properties)).not.toContain("facultyId");
    expect(Object.keys(schemas.ScheduleNamedReference.properties)).not.toContain("sheetId");
    expect(Object.keys(schemas.ScheduleNamedReference.properties)).not.toContain("applicationFormUrl");
  });
});
