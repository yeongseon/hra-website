/**
 * #100 공동 자료 열람은 승인 역할에만 열고 기수에 따른 차별을 두지 않는다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canReadSharedResource } from "@/features/resources/access";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/db", () => ({
  db: new Proxy({}, { get: () => { throw new Error("DB_ACCESSED_BEFORE_AUTH"); } }),
}));

import { requireSharedResourceReader } from "@/lib/resource-access";
import ResourcesPage from "@/app/(member)/resources/page";
import { generateMetadata as classLogMetadata } from "@/app/(member)/resources/[id]/page";
import { generateMetadata as weeklyTextMetadata } from "@/app/(member)/resources/weekly-texts/[id]/page";
import { generateMetadata as guidebookMetadata } from "@/app/(member)/resources/guidebooks/[id]/page";
import ClassLogDetailPage from "@/app/(member)/resources/[id]/page";
import ClassLogPrintPage from "@/app/(member)/resources/[id]/print/page";
import WeeklyTextDetailPage from "@/app/(member)/resources/weekly-texts/[id]/page";
import WeeklyTextPrintPage from "@/app/(member)/resources/weekly-texts/[id]/print/page";
import GuidebookDetailPage from "@/app/(member)/resources/guidebooks/[id]/page";

describe("공동 자료 서버 열람 정책", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
  });

  it.each(["ADMIN", "FACULTY", "MEMBER"])("%s는 기수와 무관한 공동 자료를 열람한다", async role => {
    mocks.auth.mockResolvedValue({ user: { id: "user", role } });
    expect(canReadSharedResource(role)).toBe(true);
    await expect(requireSharedResourceReader()).resolves.toMatchObject({ user: { role } });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(["PENDING", "UNKNOWN", null, undefined])("%s 역할은 공동 자료를 열람하지 못한다", role => {
    expect(canReadSharedResource(role)).toBe(false);
  });

  it("승인 대기 계정은 자료 조회 전에 대기 페이지로 이동한다", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user", role: "PENDING" } });
    await expect(requireSharedResourceReader()).rejects.toThrow("REDIRECT:/pending");
    expect(mocks.redirect).toHaveBeenCalledWith("/pending");
  });

  it("승인 대기 계정의 통합 자료실은 DB 조회를 시작하지 않는다", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user", role: "PENDING" } });
    await expect(ResourcesPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/pending");
  });

  it("승인 대기 계정에게 상세 메타데이터 제목을 노출하지 않는다", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user", role: "PENDING" } });
    const params = Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" });
    expect(await classLogMetadata({ params })).toEqual({ title: "자료실" });
    expect(await weeklyTextMetadata({ params })).toEqual({ title: "주차별 텍스트" });
    expect(await guidebookMetadata({ params })).toEqual({ title: "가이드북" });
  });

  it("승인 대기 계정의 상세·인쇄 경로는 DB 조회 전에 차단한다", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "user", role: "PENDING" } });
    const params = Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" });
    for (const page of [ClassLogDetailPage, ClassLogPrintPage, WeeklyTextDetailPage,
      WeeklyTextPrintPage, GuidebookDetailPage]) {
      await expect(page({ params })).rejects.toThrow("REDIRECT:/pending");
    }
  });

  it("비로그인 계정은 로그인 페이지로 이동한다", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(requireSharedResourceReader()).rejects.toThrow("REDIRECT:/login");
  });
});
