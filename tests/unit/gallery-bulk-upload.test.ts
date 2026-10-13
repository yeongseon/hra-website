/**
 * 갤러리 다중 업로드에서 DB 참조 파일을 지우지 않는지 확인합니다 (#92).
 * 업로드, 이미지 행 저장, 커버 갱신의 실패 단계를 각각 주입합니다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  findGallery: vi.fn(),
  put: vi.fn(),
  insertValues: vi.fn(),
  updateWhere: vi.fn(),
  deleteBlobIfExists: vi.fn(),
  logServerError: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({ put: mocks.put }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/blob-utils", () => ({ deleteBlobIfExists: mocks.deleteBlobIfExists }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.logServerError }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    query: { galleries: { findFirst: mocks.findGallery } },
    insert: () => ({ values: mocks.insertValues }),
    update: () => ({ set: () => ({ where: mocks.updateWhere }) }),
  },
}));

import { addGalleryImages } from "@/features/gallery/actions";

const galleryId = "11111111-1111-4111-8111-111111111111";
const firstUrl = "https://example.public.blob.vercel-storage.com/gallery/first.png";
const secondUrl = "https://example.public.blob.vercel-storage.com/gallery/second.png";

function imagesForm() {
  const formData = new FormData();
  formData.append("images", new File(["first"], "first.png", { type: "image/png" }));
  formData.append("images", new File(["second"], "second.png", { type: "image/png" }));
  return formData;
}

describe("갤러리 다중 업로드 보상 정리", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findGallery.mockResolvedValue({ id: galleryId, coverImageUrl: null, images: [] });
    mocks.put.mockResolvedValueOnce({ url: firstUrl }).mockResolvedValueOnce({ url: secondUrl });
    mocks.insertValues.mockResolvedValue([]);
    mocks.updateWhere.mockResolvedValue([]);
    mocks.deleteBlobIfExists.mockResolvedValue(undefined);
  });

  it("정상 저장 시 이미지 두 건과 커버를 갱신하고 파일을 보존한다", async () => {
    const result = await addGalleryImages(galleryId, imagesForm());

    expect(result.success).toBe(true);
    expect(mocks.insertValues).toHaveBeenCalledOnce();
    expect(mocks.updateWhere).toHaveBeenCalledOnce();
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();
  });

  it("한 업로드가 먼저 실패해도 나머지 업로드 종료 후 생성 파일을 정리한다", async () => {
    let finishSecond!: (value: { url: string }) => void;
    mocks.put.mockReset()
      .mockRejectedValueOnce(new Error("첫 번째 업로드 실패"))
      .mockImplementationOnce(() => new Promise((resolve) => { finishSecond = resolve; }));

    const pending = addGalleryImages(galleryId, imagesForm());
    await vi.waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(2));
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();

    finishSecond({ url: secondUrl });
    const result = await pending;

    expect(result.success).toBe(false);
    expect(mocks.insertValues).not.toHaveBeenCalled();
    expect(mocks.deleteBlobIfExists).toHaveBeenCalledExactlyOnceWith(secondUrl);
  });

  it("이미지 INSERT 실패 시 커밋 여부를 알 수 없어 파일을 보존한다", async () => {
    mocks.insertValues.mockRejectedValueOnce(new Error("INSERT 실패"));

    const result = await addGalleryImages(galleryId, imagesForm());

    expect(result.success).toBe(false);
    expect(mocks.updateWhere).not.toHaveBeenCalled();
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();
  });

  it("INSERT 응답만 실패한 경우에도 파일을 지우지 않는다", async () => {
    mocks.insertValues.mockRejectedValueOnce(new Error("INSERT 응답 실패"));

    const result = await addGalleryImages(galleryId, imagesForm());

    expect(result.success).toBe(false);
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();
  });

  it("커버 UPDATE만 실패하면 이미 저장된 이미지와 파일을 보존하고 부분 성공을 알린다", async () => {
    mocks.updateWhere.mockRejectedValueOnce(new Error("커버 UPDATE 실패"));

    const result = await addGalleryImages(galleryId, imagesForm());

    expect(result.success).toBe(true);
    expect(result.message).toContain("대표 사진 설정에 실패");
    expect(mocks.insertValues).toHaveBeenCalledOnce();
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();
  });
});
