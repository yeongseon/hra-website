/**
 * 세 게시글 생성 액션이 첨부 메타를 글과 같은 배치에 넣고 실패 후 Blob을 정리하는지 검증합니다.
 * 실제 운영 DB·Blob에는 쓰지 않으며 외부 경계에 실패를 주입합니다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  requireAdmin: vi.fn(),
  put: vi.fn(),
  recordOwnedBlob: vi.fn(),
  deleteBlobIfExists: vi.fn(),
  batch: vi.fn(),
  insertValues: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  logServerError: vi.fn(),
  existing: false,
  validateResourceUploadReference: vi.fn(),
  validateWeeklyTextImageReference: vi.fn(),
  validateAlumniImageReference: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({ put: mocks.put }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/owned-blob", () => ({ recordOwnedBlob: mocks.recordOwnedBlob }));
vi.mock("@/lib/blob-utils", () => ({ deleteBlobIfExists: mocks.deleteBlobIfExists }));
vi.mock("@/lib/resource-upload-server", () => ({ validateResourceUploadReference: mocks.validateResourceUploadReference }));
vi.mock("@/lib/weekly-text-image-upload", () => ({ validateWeeklyTextImageReference: mocks.validateWeeklyTextImageReference }));
vi.mock("@/lib/alumni-upload-server", () => ({ validateAlumniImageReference: mocks.validateAlumniImageReference }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.logServerError }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/db", () => ({
  db: {
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        mocks.insertValues(table, values);
        return { table, values, then: (resolve: (value: unknown) => void) => Promise.resolve([{ id: "created" }]).then(resolve) };
      },
    }),
    batch: mocks.batch,
    select: (fields: Record<string, unknown>) => ({
      from: () => ({
        then: (resolve: (value: unknown) => void) => Promise.resolve([{ maxOrder: 0 }]).then(resolve),
        where: () => ({
          limit: () => Promise.resolve(mocks.existing ? [{ id: "created", fileUrl: "https://blob/old" }] : []),
          then: (resolve: (value: unknown) => void) => Promise.resolve(
            fields.url ? [{ url: "https://blob/old" }] : [],
          ).then(resolve),
        }),
      }),
    }),
  },
}));

import { createClassLog } from "@/features/class-logs/actions";
import { createWeeklyText } from "@/features/weekly-texts/actions";
import { createAlumniStory } from "@/features/alumni/actions";

const requestId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

function image() {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "photo.png", { type: "image/png" });
}

function classLogForm() {
  const form = new FormData();
  form.set("requestId", requestId);
  form.set("title", "수업일지");
  form.set("content", "수업 내용");
  form.set("classDate", "2026-10-13");
  form.append("images", image());
  return form;
}

function weeklyTextForm() {
  const form = new FormData();
  form.set("requestId", requestId);
  form.set("title", "주차별 텍스트");
  form.set("body", "본문");
  form.append("images", image());
  return form;
}

function alumniForm() {
  const form = new FormData();
  form.set("requestId", requestId);
  form.set("name", "수료생");
  form.set("quote", "대표 문구");
  form.set("content", "본문");
  form.append("images", image());
  return form;
}

describe("게시글과 첨부 메타 생성", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.existing = false;
    mocks.requireAdmin.mockResolvedValue({ user: { id: userId, role: "ADMIN" } });
    mocks.auth.mockResolvedValue({ user: { id: userId, role: "ADMIN" } });
    mocks.put.mockResolvedValue({ url: "https://blob/new" });
    mocks.recordOwnedBlob.mockResolvedValue(undefined);
    mocks.deleteBlobIfExists.mockResolvedValue(undefined);
    mocks.batch.mockResolvedValue([]);
    mocks.validateResourceUploadReference.mockResolvedValue({ url: "https://blob/direct", fileName: "자료.pdf" });
    mocks.validateWeeklyTextImageReference.mockResolvedValue(true);
    mocks.validateAlumniImageReference.mockResolvedValue(true);
  });

  it.each([
    ["수업일지", createClassLog, classLogForm],
    ["주차별 텍스트", createWeeklyText, weeklyTextForm],
    ["수료생 이야기", createAlumniStory, alumniForm],
  ])("%s 첨부 INSERT 실패 시 글·메타 배치가 실패하고 새 Blob을 정리한다", async (_label, create, makeForm) => {
    mocks.batch.mockRejectedValueOnce(new Error("첨부 INSERT 실패"));

    const result = await create(makeForm());

    expect(result?.success).toBe(false);
    expect(mocks.batch).toHaveBeenCalledTimes(1);
    expect(mocks.batch.mock.calls[0]?.[0]).toHaveLength(2);
    expect(mocks.deleteBlobIfExists).toHaveBeenCalledExactlyOnceWith("https://blob/new");
  });

  it("수업일지의 업로드 실패는 DB 배치를 실행하지 않고 같은 요청 키로 재시도할 수 있다", async () => {
    mocks.put.mockRejectedValueOnce(new Error("업로드 실패"));
    const failed = await createClassLog(classLogForm());
    expect(failed.success).toBe(false);
    expect(mocks.batch).not.toHaveBeenCalled();

    const retried = await createClassLog(classLogForm());
    expect(retried.success).toBe(true);
    expect(mocks.batch).toHaveBeenCalledTimes(1);
    expect(mocks.batch.mock.calls[0]?.[0][0].values.id).toBe(requestId);
    expect(mocks.put).toHaveBeenLastCalledWith(expect.any(String), expect.any(File), expect.objectContaining({ contentType: "image/png" }));
  });

  it("같은 요청 키의 재제출은 Blob 업로드와 DB INSERT를 다시 하지 않는다", async () => {
    mocks.existing = true;
    const result = await createClassLog(classLogForm());
    expect(result.success).toBe(true);
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.batch).not.toHaveBeenCalled();
  });

  it("같은 키의 동시 제출로 배치가 충돌하면 나중 요청의 Blob만 정리한다", async () => {
    mocks.batch.mockImplementationOnce(() => {
      mocks.existing = true;
      return Promise.reject(new Error("중복 키"));
    });

    const result = await createClassLog(classLogForm());
    expect(result.success).toBe(true);
    expect(mocks.deleteBlobIfExists).toHaveBeenCalledExactlyOnceWith("https://blob/new");
  });

  it("날짜 검증 실패는 파일을 올리지 않는다", async () => {
    const form = weeklyTextForm();
    form.set("classDate", "잘못된 날짜");
    const result = await createWeeklyText(form);
    expect(result.success).toBe(false);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("선언 MIME만 PDF인 가짜 문서는 Blob에 올리지 않는다", async () => {
    const form = weeklyTextForm();
    form.set("file", new File(["<html>"], "가짜.pdf", { type: "application/pdf" }));
    const result = await createWeeklyText(form);
    expect(result.success).toBe(false);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("주차별 텍스트의 검증된 직접 업로드 URL만 DB에 저장한다", async () => {
    const form = new FormData();
    form.set("requestId", requestId);
    form.set("title", "주차별 텍스트");
    form.set("uploadedFileUrl", "https://blob/direct");
    form.set("uploadedFileName", "자료.pdf");
    const result = await createWeeklyText(form);
    expect(result.success).toBe(true);
    expect(mocks.validateResourceUploadReference).toHaveBeenCalledWith("weekly-texts", userId, "https://blob/direct", "자료.pdf");
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fileUrl: "https://blob/direct", fileName: "자료.pdf" }));
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("주차별 텍스트의 위조된 완료 URL은 DB에 저장하지 않는다", async () => {
    const form = new FormData();
    form.set("requestId", requestId);
    form.set("title", "주차별 텍스트");
    form.set("uploadedFileUrl", "https://evil.example/file.pdf");
    form.set("uploadedFileName", "자료.pdf");
    mocks.validateResourceUploadReference.mockResolvedValue({ error: "위조된 URL" });
    const result = await createWeeklyText(form);
    expect(result.success).toBe(false);
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it("주차별 텍스트의 검증된 직접 업로드 사진을 첨부 행으로 저장한다", async () => {
    const form = new FormData();
    form.set("requestId", requestId);
    form.set("title", "주차별 텍스트");
    form.set("body", "본문");
    form.set("uploadedImageUrls", JSON.stringify(["https://blob/photo"]));
    const result = await createWeeklyText(form);
    expect(result.success).toBe(true);
    expect(mocks.validateWeeklyTextImageReference).toHaveBeenCalledWith(requestId, userId, "https://blob/photo");
    expect(mocks.batch).toHaveBeenCalledOnce();
    expect(mocks.batch.mock.calls[0]?.[0][1].values[0].url).toBe("https://blob/photo");
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("주차별 텍스트의 위조된 사진 URL은 첨부 행에 저장하지 않는다", async () => {
    const form = new FormData();
    form.set("requestId", requestId);
    form.set("title", "주차별 텍스트");
    form.set("body", "본문");
    form.set("uploadedImageUrls", JSON.stringify(["https://evil.example/photo.png"]));
    mocks.validateWeeklyTextImageReference.mockResolvedValue(false);
    expect((await createWeeklyText(form)).success).toBe(false);
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it("수료생 사진의 검증된 직접 업로드 URL만 글과 첨부 행에 저장한다", async () => {
    const form = alumniForm();
    form.delete("images");
    form.set("uploadedImageUrls", JSON.stringify(["https://blob/alumni"]));
    await createAlumniStory(form);
    expect(mocks.validateAlumniImageReference).toHaveBeenCalledWith(requestId, userId, "https://blob/alumni");
    expect(mocks.batch.mock.calls[0]?.[0][1].values[0].url).toBe("https://blob/alumni");
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("수료생 사진의 위조된 완료 URL은 저장하지 않는다", async () => {
    const form = alumniForm();
    form.delete("images");
    form.set("uploadedImageUrls", JSON.stringify(["https://evil.example/photo.png"]));
    mocks.validateAlumniImageReference.mockResolvedValue(false);
    const result = await createAlumniStory(form);
    expect(result?.success).toBe(false);
    expect(mocks.batch).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });
});
