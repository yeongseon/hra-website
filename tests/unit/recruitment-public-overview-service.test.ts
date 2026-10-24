/**
 * 공개 모집안내 Service의 날짜 정책·기수 조건부 조회·표시 DTO를 검증합니다.
 * 실제 DB는 Repository 전용 회귀에서 따로 검증합니다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
  cohort: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/recruitment/public-overview/repository", () => ({
  findPublicRecruitmentSettingsRow: mocks.settings,
  findPublicRecruitmentCohortRow: mocks.cohort,
}));

import { getPublicRecruitmentOverview } from "@/features/recruitment/public-overview/service";

const cohortId = "11111111-1111-4111-8111-111111111111";
const settings = {
  activeCohortId: cohortId,
  recruitmentStartDate: new Date("2026-10-16T00:00:00Z"),
  deadlineDate: new Date("2026-10-30T00:00:00Z"),
  googleFormUrl: "https://forms.example.invalid/apply",
  posterImageUrl: "https://images.example.invalid/poster.jpg",
  posterLayout: "left",
  detailsMarkdown: "# 합성 안내",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.settings.mockResolvedValue(null);
  mocks.cohort.mockResolvedValue(null);
});

describe("공개 모집안내 서비스", () => {
  it("설정이 없으면 추가 기수 조회 없이 빈 화면 DTO를 반환한다", async () => {
    const result = await getPublicRecruitmentOverview(new Date("2026-10-20T00:00:00Z"));
    expect(result).toEqual({
      activeCohort: null,
      recruitmentStatus: "UPCOMING",
      recruitmentStartDate: null,
      deadlineDate: null,
      googleFormUrl: null,
      posterImageUrl: null,
      posterLayout: null,
      detailsMarkdown: null,
    });
    expect(mocks.cohort).not.toHaveBeenCalled();
  });

  it("설정의 활성 기수만 읽고 저장된 상태 열 없이 한국 날짜로 접수 상태를 계산한다", async () => {
    mocks.settings.mockResolvedValue(settings);
    mocks.cohort.mockResolvedValue({ id: cohortId, name: "합성 20기", description: "합성 소개" });
    const result = await getPublicRecruitmentOverview(new Date("2026-10-20T00:00:00Z"));
    expect(mocks.cohort).toHaveBeenCalledExactlyOnceWith(cohortId);
    expect(result).toEqual({
      activeCohort: { name: "합성 20기", description: "합성 소개" },
      recruitmentStatus: "OPEN",
      recruitmentStartDate: settings.recruitmentStartDate,
      deadlineDate: settings.deadlineDate,
      googleFormUrl: settings.googleFormUrl,
      posterImageUrl: settings.posterImageUrl,
      posterLayout: "left",
      detailsMarkdown: settings.detailsMarkdown,
    });
    expect(JSON.stringify(result)).not.toContain(cohortId);
  });

  it("고아 기수 참조는 배너만 비우고 설정의 안내·날짜를 유지한다", async () => {
    mocks.settings.mockResolvedValue(settings);
    const result = await getPublicRecruitmentOverview(new Date("2026-11-01T00:00:00Z"));
    expect(result).toMatchObject({ activeCohort: null, recruitmentStatus: "CLOSED", detailsMarkdown: "# 합성 안내" });
    expect(result.deadlineDate).toEqual(settings.deadlineDate);
  });

  it("한국 자정 경계와 종료일 포함 정책을 유지한다", async () => {
    mocks.settings.mockResolvedValue({ ...settings, recruitmentStartDate: new Date("2026-03-20T00:00:00Z"), deadlineDate: new Date("2026-03-20T00:00:00Z"), activeCohortId: null });
    expect((await getPublicRecruitmentOverview(new Date("2026-03-19T14:59:59Z"))).recruitmentStatus).toBe("UPCOMING");
    expect((await getPublicRecruitmentOverview(new Date("2026-03-19T15:00:00Z"))).recruitmentStatus).toBe("OPEN");
    expect((await getPublicRecruitmentOverview(new Date("2026-03-20T14:59:59Z"))).recruitmentStatus).toBe("OPEN");
    expect((await getPublicRecruitmentOverview(new Date("2026-03-20T15:00:00Z"))).recruitmentStatus).toBe("CLOSED");
    expect(mocks.cohort).not.toHaveBeenCalled();
  });

  it("DB 조회 중 한국 자정을 넘으면 조회를 마친 시각으로 상태를 계산한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T14:59:59Z"));
    mocks.settings.mockImplementationOnce(async () => {
      vi.setSystemTime(new Date("2026-03-19T15:00:00Z"));
      return { ...settings, activeCohortId: null, recruitmentStartDate: new Date("2026-03-20T00:00:00Z"), deadlineDate: null };
    });
    try {
      expect((await getPublicRecruitmentOverview()).recruitmentStatus).toBe("OPEN");
    } finally {
      vi.useRealTimers();
    }
  });

  it("설정 또는 기수 DB 실패를 빈 모집으로 바꾸지 않는다", async () => {
    const failure = new Error("합성 DB 오류");
    mocks.settings.mockRejectedValueOnce(failure);
    await expect(getPublicRecruitmentOverview()).rejects.toBe(failure);
    mocks.settings.mockResolvedValueOnce(settings);
    mocks.cohort.mockRejectedValueOnce(failure);
    await expect(getPublicRecruitmentOverview()).rejects.toBe(failure);
  });
});
