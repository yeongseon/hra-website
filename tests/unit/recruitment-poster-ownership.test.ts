/**
 * 모집 포스터는 파일 업로드와 관리자 입력 URL을 모두 허용합니다.
 * 과거 URL이 같은 Blob 저장소를 가리켜도 소유권이 확인되지 않았으므로
 * 설정 변경이 다른 콘텐츠의 파일을 지우지 않는지 검증합니다 (#88).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  limit: vi.fn(),
  upsert: vi.fn(),
  insertValues: vi.fn(),
  deleteBlobIfExists: vi.fn(),
  revalidatePath: vi.fn(),
  prepareStoredPoster: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/blob-utils", () => ({
  deleteBlobIfExists: mocks.deleteBlobIfExists,
  isBlobUrl: () => true,
}));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: () => ({ limit: mocks.limit }) }),
    insert: () => ({ values: (values: unknown) => {
      mocks.insertValues(values);
      return { onConflictDoUpdate: mocks.upsert };
    } }),
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/poster-upload-server", () => ({ prepareStoredPoster: mocks.prepareStoredPoster }));

import {
  updateRecruitmentPoster,
  updateRecruitmentSettings,
  updateRecruitmentInfo,
  updateRecruitmentDetails,
} from "@/features/recruitment-settings/actions";

const oldUrl = "https://example.public.blob.vercel-storage.com/markdown-images/shared.png";

function posterForm() {
  const formData = new FormData();
  formData.set("posterInputMode", "url");
  formData.set("posterImageUrl", "https://example.com/new-poster.png");
  formData.set("posterLayout", "right");
  return formData;
}

describe("모집 포스터 입력 URL 소유권", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ user: { id: "22222222-2222-4222-8222-222222222222", role: "ADMIN" } });
    mocks.prepareStoredPoster.mockResolvedValue("https://example.public.blob.vercel-storage.com/recruitment/poster.webp");
    mocks.limit.mockResolvedValue([{
      id: "11111111-1111-4111-8111-111111111111",
      posterImageUrl: oldUrl,
    }]);
    mocks.upsert.mockResolvedValue([]);
  });

  it.each([
    ["전체 설정", updateRecruitmentSettings],
    ["포스터 섹션", updateRecruitmentPoster],
  ])("%s 변경 시 과거 입력 URL을 삭제하지 않는다", async (_label, action) => {
    const result = await action(posterForm());

    expect(result.success).toBe(true);
    expect(mocks.upsert).toHaveBeenCalledOnce();
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();
  });

  it("서로 다른 설정 섹션은 같은 고정 키를 사용하고 자기 필드만 갱신한다", async () => {
    const info = new FormData();
    info.set("googleFormUrl", "https://example.com/apply");
    const details = new FormData();
    details.set("detailsMarkdown", "모집 안내");

    expect((await updateRecruitmentInfo(info)).success).toBe(true);
    expect((await updateRecruitmentDetails(details)).success).toBe(true);
    expect(mocks.insertValues.mock.calls.map(([values]) => values.singletonKey)).toEqual([1, 1]);
    expect(mocks.upsert.mock.calls[0][0].set).toHaveProperty("googleFormUrl", "https://example.com/apply");
    expect(mocks.upsert.mock.calls[0][0].set).not.toHaveProperty("detailsMarkdown");
    expect(mocks.upsert.mock.calls[1][0].set).toHaveProperty("detailsMarkdown", "모집 안내");
    expect(mocks.upsert.mock.calls[1][0].set).not.toHaveProperty("googleFormUrl");
  });

  it.each([
    ["전체 설정", updateRecruitmentSettings],
    ["포스터 섹션", updateRecruitmentPoster],
  ])("%s는 검증·변환된 직접 업로드 포스터 URL을 저장한다", async (_label, action) => {
    const formData = new FormData();
    formData.set("posterInputMode", "file");
    formData.set("uploadedPosterUrl", "https://example.public.blob.vercel-storage.com/poster-uploads/original.png");
    expect((await action(formData)).success).toBe(true);
    expect(mocks.prepareStoredPoster).toHaveBeenCalledWith(formData.get("uploadedPosterUrl"), "22222222-2222-4222-8222-222222222222");
    expect(mocks.upsert.mock.calls[0][0].set.posterImageUrl).toBe("https://example.public.blob.vercel-storage.com/recruitment/poster.webp");
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();
  });

  it("검증 실패한 직접 업로드 URL은 설정에 저장하지 않는다", async () => {
    mocks.prepareStoredPoster.mockRejectedValue(new Error("위조된 URL"));
    const formData = new FormData();
    formData.set("posterInputMode", "file");
    formData.set("uploadedPosterUrl", "https://evil.example/poster.png");
    expect((await updateRecruitmentPoster(formData)).success).toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("직접 업로드 후 DB 응답이 실패해도 참조 가능성이 있는 Blob을 즉시 삭제하지 않는다", async () => {
    mocks.upsert.mockRejectedValueOnce(new Error("DB 응답 실패"));
    const formData = new FormData();
    formData.set("posterInputMode", "file");
    formData.set("uploadedPosterUrl", "https://example.public.blob.vercel-storage.com/poster-uploads/original.png");
    await expect(updateRecruitmentPoster(formData)).rejects.toThrow("DB 응답 실패");
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();
  });
});
