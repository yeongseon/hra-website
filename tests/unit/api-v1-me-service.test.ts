// @vitest-environment node
/**
 * 본인 프로필 서비스는 검증된 주체와 현재 행의 ID·역할이 같을 때만 표시 필드를 돌려줍니다.
 * 유효하지 않은 세션·역할과 계정 삭제/변경은 DB 전 또는 DTO 반환 전에 실패 차단합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({ findUserProfileById: vi.fn() }));
vi.mock("@/features/users/me/repository", () => repository);

import { getCurrentProfile, type MePrincipal } from "@/features/users/me/service";

const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const legacyUuid = "11111111-1111-1111-1111-111111111111";
const profile = {
  id, name: "합성 사용자", email: "member@example.invalid", role: "PENDING",
  cohortId: null, image: null, passwordHash: "내부 필드", sessionVersion: 4,
};

beforeEach(() => {
  vi.resetAllMocks();
  repository.findUserProfileById.mockResolvedValue(profile);
});

it("PENDING도 본인 행의 여섯 표시 필드만 읽는다", async () => {
  expect(await getCurrentProfile({ userId: id, role: "PENDING" })).toEqual({
    id, name: "합성 사용자", email: "member@example.invalid", role: "PENDING",
    cohortId: null, image: null,
  });
  expect(repository.findUserProfileById).toHaveBeenCalledWith(id);
});

it("유효하지 않은 ID·역할은 저장소 호출 전에 거부한다", async () => {
  expect(await getCurrentProfile({ userId: "", role: "PENDING" })).toBeNull();
  expect(await getCurrentProfile({ userId: "not-a-uuid", role: "ADMIN" })).toBeNull();
  expect(await getCurrentProfile({ userId: id, role: "SUPERUSER" } as unknown as MePrincipal)).toBeNull();
  expect(repository.findUserProfileById).not.toHaveBeenCalled();
});

it("기존 인증·API 계약이 허용한 8-4-4-4-12 UUID는 다시 거부하지 않는다", async () => {
  repository.findUserProfileById.mockResolvedValueOnce({ ...profile, id: legacyUuid });
  expect(await getCurrentProfile({ userId: legacyUuid, role: "PENDING" })).toMatchObject({ id: legacyUuid });
  expect(repository.findUserProfileById).toHaveBeenCalledWith(legacyUuid);
});

it("삭제·대체된 ID와 역할 변경은 세션 프로필로 반환하지 않는다", async () => {
  repository.findUserProfileById.mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ ...profile, id: otherId })
    .mockResolvedValueOnce({ ...profile, role: "MEMBER" });
  for (let index = 0; index < 3; index++) {
    expect(await getCurrentProfile({ userId: id, role: "PENDING" })).toBeNull();
  }
});
