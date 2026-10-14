/**
 * 게시글 생성용 Blob 업로드의 늦은 성공과 실패 후 정리 경계를 검증합니다.
 * 실제 Blob·DB에는 접근하지 않고 각 외부 호출의 결과를 주입합니다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  put: vi.fn(),
  recordOwnedBlob: vi.fn(),
  deleteBlobIfExists: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({ put: mocks.put }));
vi.mock("@/lib/owned-blob", () => ({ recordOwnedBlob: mocks.recordOwnedBlob }));
vi.mock("@/lib/blob-utils", () => ({ deleteBlobIfExists: mocks.deleteBlobIfExists }));

import { cleanupCreatedBlobs, uploadBlobsForCreate } from "@/lib/create-with-blobs";

const files = [
  { pathname: "images/one.png", file: new File(["one"], "one.png", { type: "image/png" }) },
  { pathname: "images/two.png", file: new File(["two"], "two.png", { type: "image/png" }) },
];

describe("게시글 생성용 Blob 업로드", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.recordOwnedBlob.mockResolvedValue(undefined);
    mocks.deleteBlobIfExists.mockResolvedValue(undefined);
  });

  it("모든 성공 URL을 입력 순서대로 돌려주고 소유권을 기록한다", async () => {
    mocks.put.mockResolvedValueOnce({ url: "https://blob/one" }).mockResolvedValueOnce({ url: "https://blob/two" });

    await expect(uploadBlobsForCreate(files, "user-id")).resolves.toEqual([
      "https://blob/one", "https://blob/two",
    ]);
    expect(mocks.recordOwnedBlob).toHaveBeenNthCalledWith(1, "https://blob/one", "user-id");
    expect(mocks.recordOwnedBlob).toHaveBeenNthCalledWith(2, "https://blob/two", "user-id");
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();
  });

  it("한 업로드가 실패해도 늦게 성공한 업로드까지 기다려 정리한다", async () => {
    let finishSecond: ((value: { url: string }) => void) | undefined;
    mocks.put
      .mockRejectedValueOnce(new Error("첫 업로드 실패"))
      .mockImplementationOnce(() => new Promise((resolve) => { finishSecond = resolve; }));

    const result = uploadBlobsForCreate(files);
    await Promise.resolve();
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();
    expect(finishSecond).toBeDefined();
    finishSecond?.({ url: "https://blob/late" });

    await expect(result).rejects.toThrow("첨부 파일 업로드에 실패했습니다.");
    expect(mocks.deleteBlobIfExists).toHaveBeenCalledExactlyOnceWith("https://blob/late");
  });

  it("원장 기록 실패 후에도 다른 성공 파일의 정리를 시도한다", async () => {
    mocks.put.mockResolvedValueOnce({ url: "https://blob/one" }).mockResolvedValueOnce({ url: "https://blob/two" });
    mocks.recordOwnedBlob.mockRejectedValueOnce(new Error("원장 실패"));

    await expect(uploadBlobsForCreate(files)).rejects.toThrow("첨부 파일 업로드에 실패했습니다.");
    expect(mocks.deleteBlobIfExists).toHaveBeenCalledExactlyOnceWith("https://blob/two");
  });

  it("정리 호출은 모든 URL에 대해 진행한다", async () => {
    mocks.deleteBlobIfExists.mockResolvedValue(undefined);
    await cleanupCreatedBlobs(["https://blob/one", "https://blob/two"]);
    expect(mocks.deleteBlobIfExists).toHaveBeenCalledTimes(2);
  });
});
