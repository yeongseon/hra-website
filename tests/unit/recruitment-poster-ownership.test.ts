/**
 * 모집 포스터는 파일 업로드와 관리자 입력 URL을 모두 허용합니다.
 * 과거 URL이 같은 Blob 저장소를 가리켜도 소유권이 확인되지 않았으므로
 * 설정 변경이 다른 콘텐츠의 파일을 지우지 않는지 검증합니다 (#88).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  limit: vi.fn(),
  where: vi.fn(),
  deleteBlobIfExists: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/blob-utils", () => ({
  deleteBlobIfExists: mocks.deleteBlobIfExists,
  isBlobUrl: () => true,
}));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: () => ({ limit: mocks.limit }) }),
    update: () => ({ set: () => ({ where: mocks.where }) }),
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  updateRecruitmentPoster,
  updateRecruitmentSettings,
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
    mocks.limit.mockResolvedValue([{
      id: "11111111-1111-4111-8111-111111111111",
      posterImageUrl: oldUrl,
    }]);
    mocks.where.mockResolvedValue([]);
  });

  it.each([
    ["전체 설정", updateRecruitmentSettings],
    ["포스터 섹션", updateRecruitmentPoster],
  ])("%s 변경 시 과거 입력 URL을 삭제하지 않는다", async (_label, action) => {
    const result = await action(posterForm());

    expect(result.success).toBe(true);
    expect(mocks.where).toHaveBeenCalledOnce();
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();
  });
});
