// @vitest-environment node
/**
 * 공용 계약 workspace와 기존 Web import 경로가 같은 정본을 사용합니다.
 * 인증 hot path는 가벼운 identity 하위 경로만 공유하며 패키지는 Web 코드에 의존하지 않습니다.
 */
import { readFileSync } from "node:fs";
import { beforeAll, expect, it } from "vitest";
import * as packageApi from "@hra/contracts/api-v1";
import * as packageIdentity from "@hra/contracts/identity";
import * as webApi from "@/contracts/api-v1";
import { getDisplayEmail, isOAuthPlaceholderEmail } from "@/lib/auth-email";
import { USER_ROLES } from "@/lib/auth-session";
import { userRoleEnum } from "@/lib/db/schema";

const packageSources = [
  "packages/contracts/src/api-v1.ts",
  "packages/contracts/src/identity.ts",
  "packages/contracts/src/index.ts",
];

beforeAll(() => {
  for (const file of packageSources) {
    const source = readFileSync(file, "utf8");
    const imports = [...source.matchAll(/\bfrom\s+["']([^"']+)["']/g)]
      .map((match) => match[1]);
    expect(imports.every((name) => name === "zod/v4" || name.startsWith("./"))).toBe(true);
  }
});

it("Web 호환 경로의 모든 API v1 export가 workspace 정본과 일치한다", () => {
  expect(Object.keys(webApi).sort()).toEqual(Object.keys(packageApi).sort());
  expect(webApi.apiV1NoticeSummarySchema).toBe(packageApi.apiV1NoticeSummarySchema);
  expect(webApi.toApiV1ErrorResponse).toBe(packageApi.toApiV1ErrorResponse);
});

it("인증의 역할·표시 이메일 정책이 identity 하위 경로와 같은 참조다", () => {
  expect(USER_ROLES).toBe(packageIdentity.USER_ROLES);
  expect(userRoleEnum.enumValues).toEqual(packageIdentity.USER_ROLES);
  expect(getDisplayEmail).toBe(packageIdentity.getDisplayEmail);
  expect(isOAuthPlaceholderEmail).toBe(packageIdentity.isOAuthPlaceholderEmail);
  expect(getDisplayEmail("kakao_123@oauth.placeholder")).toBeNull();
});
