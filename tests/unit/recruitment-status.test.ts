/**
 * 모집안내는 한국 날짜의 자정에 전환되고, 내부 접수 일정은 별도로 다룹니다.
 * 저장된 날짜의 UTC 자정 표현과 서버/브라우저의 현재 시각을 혼동하지 않도록 검증합니다.
 */
import { describe, expect, it, vi } from "vitest";
import {
  computeRecruitmentStatus,
  getSeoulDateKey,
  getStoredDateKey,
} from "@/features/recruitment/status";

const { insertMock } = vi.hoisted(() => ({ insertMock: vi.fn() }));

vi.mock("@/lib/admin", () => ({ requireAdmin: vi.fn(async () => ({ user: { id: "admin" } })) }));
vi.mock("@/lib/db", () => ({ db: { insert: insertMock } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  updateRecruitmentInfo,
  updateRecruitmentSettings,
} from "@/features/recruitment-settings/actions";

describe("한국 날짜 모집 상태", () => {
  it.each([
    ["2026-03-19T14:59:59.000Z", "2026-03-19", "UPCOMING"],
    ["2026-03-19T15:00:00.000Z", "2026-03-20", "OPEN"],
    ["2026-03-20T14:59:59.000Z", "2026-03-20", "OPEN"],
    ["2026-03-20T15:00:00.000Z", "2026-03-21", "CLOSED"],
  ] as const)("%s 시각의 한국 날짜와 모집 상태", (instant, date, status) => {
    const now = new Date(instant);
    expect(getSeoulDateKey(now)).toBe(date);
    expect(computeRecruitmentStatus("2026-03-20", "2026-03-20", now)).toBe(status);
  });

  it("종료일이 없으면 시작일 뒤 계속 모집 중이고, 시작일이 없으면 자동으로 열리지 않는다", () => {
    const now = new Date("2026-03-20T15:00:00.000Z");
    expect(computeRecruitmentStatus("2026-03-20", null, now)).toBe("OPEN");
    expect(computeRecruitmentStatus(null, "2026-03-21", now)).toBe("UPCOMING");
    expect(computeRecruitmentStatus(null, null, now)).toBe("UPCOMING");
  });

  it("저장된 UTC 자정에서는 관리자가 선택한 달력 날짜만 읽는다", () => {
    expect(getStoredDateKey(new Date("2026-03-20T00:00:00.000Z"))).toBe("2026-03-20");
    expect(getStoredDateKey(null)).toBeNull();
  });
});

describe("모집 일정 저장 검증", () => {
  it.each(["updateRecruitmentInfo", "updateRecruitmentSettings"] as const)(
    "%s은 종료일이 시작일보다 빠르면 DB에 쓰지 않는다",
    async (actionName) => {
      insertMock.mockClear();
      const formData = new FormData();
      formData.set("recruitmentStartDate", "2026-03-21");
      formData.set("deadlineDate", "2026-03-20");
      if (actionName === "updateRecruitmentSettings") formData.set("posterInputMode", "url");

      const result = actionName === "updateRecruitmentInfo"
        ? await updateRecruitmentInfo(formData)
        : await updateRecruitmentSettings(formData);

      expect(result.success).toBe(false);
      expect(result.fieldErrors?.deadlineDate).toBe("모집 종료일은 시작일 이후여야 합니다.");
      expect(insertMock).not.toHaveBeenCalled();
    },
  );
});
