// @vitest-environment node
/** 관리자 서버 경유 이미지가 직접 업로드와 같은 형식 계약을 적용하는지 확인합니다 (#289). */
import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { syntheticPng } from "../support/synthetic-image";

const mocks = vi.hoisted(() => ({
  put: vi.fn(), requireAdmin: vi.fn(), where: vi.fn(), limit: vi.fn(), insertValues: vi.fn(),
  updateSet: vi.fn(), returning: vi.fn(), upsert: vi.fn(), batch: vi.fn(),
  validateFaculty: vi.fn(), validateAlumni: vi.fn(), recordOwnedBlob: vi.fn(), reserve: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({ put: mocks.put }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/resource-upload-server", () => ({ recordResourceUpload: mocks.reserve }));
vi.mock("@/lib/owned-blob", () => ({ recordOwnedBlob: mocks.recordOwnedBlob }));
vi.mock("@/lib/errors", () => ({ logServerError: vi.fn() }));
vi.mock("@/lib/blob-utils", () => ({ deleteBlobIfExists: vi.fn() }));
vi.mock("@/lib/faculty-upload-server", () => ({ validateFacultyImageReference: mocks.validateFaculty }));
vi.mock("@/lib/alumni-upload-server", () => ({ validateAlumniImageReference: mocks.validateAlumni }));
vi.mock("@/lib/db", () => ({ db: {
  select: () => ({ from: () => ({ where: mocks.where, limit: mocks.limit, then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve([{ maxOrder: 0 }]).then(resolve) }) }),
  insert: () => ({ values: mocks.insertValues }),
  update: () => ({ set: mocks.updateSet }),
  batch: mocks.batch,
} }));

import { createFaculty, updateFaculty } from "@/features/faculty/actions";
import { createAlumniStory, updateAlumniStory } from "@/features/alumni/actions";
import { createCohort, updateCohort } from "@/features/recruitment/actions";
import { updateRecruitmentPoster, updateRecruitmentSettings } from "@/features/recruitment-settings/actions";
import { validateAdminImage } from "@/lib/admin-image-validation";
import { facultyImageRule } from "@/lib/faculty-upload-contract";
import { posterImageRule } from "@/lib/poster-upload-contract";

const id = "11111111-1111-4111-8111-111111111111";
const blobUrl = "https://example.public.blob.vercel-storage.com/new.png";
const operations = [
  { name: "교수 생성", field: "image", run: createFaculty, prefix: "faculty", webp: false },
  { name: "교수 수정", field: "image", run: (f: FormData) => updateFaculty(id, f), prefix: "faculty", webp: false },
  { name: "수료생 생성", field: "images", run: createAlumniStory, prefix: "alumni", webp: false },
  { name: "수료생 수정", field: "images", run: (f: FormData) => updateAlumniStory(id, f), prefix: "alumni", webp: false },
  { name: "기수 생성", field: "image", run: createCohort, prefix: "cohorts", webp: false },
  { name: "기수 수정", field: "image", run: (f: FormData) => updateCohort(id, f), prefix: "cohorts", webp: false },
  { name: "포스터 전체", field: "posterFile", run: updateRecruitmentSettings, prefix: "recruitment", webp: true },
  { name: "포스터 섹션", field: "posterFile", run: updateRecruitmentPoster, prefix: "recruitment", webp: true },
];
function form(field: string, file: File) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ name: "합성 테스트", category: "CLASSICS", order: "0", quote: "문구", content: "내용", requestId: id, posterInputMode: "file" })) data.set(key, value);
  data.set(field, file);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ user: { id, role: "ADMIN" } });
  mocks.put.mockImplementation(async path => ({ url: `https://4sompt13gxwuz2x8.public.blob.vercel-storage.com/${path}` }));
  mocks.where.mockImplementation(() => Object.assign(Promise.resolve([{ imageUrl: null }]), { limit: mocks.limit, returning: mocks.returning }));
  mocks.limit.mockResolvedValue([{ imageUrl: null, posterImageUrl: null }]);
  mocks.returning.mockResolvedValue([{ id }]);
  mocks.updateSet.mockReturnValue({ where: mocks.where });
  mocks.insertValues.mockReturnValue({ onConflictDoUpdate: mocks.upsert });
  mocks.upsert.mockResolvedValue([]);
  mocks.validateFaculty.mockResolvedValue(true);
  mocks.validateAlumni.mockResolvedValue(true);
});

describe.each(operations)("$name 서버 이미지 검증", ({ field, run, prefix, webp, name }) => {
  it.each([
    ["시그니처 위조", new File(["not a png"], "photo.png", { type: "image/png" })],
    ["확장자 위조", new File([syntheticPng()], "photo.svg", { type: "image/png" })],
    ["MIME 불일치", new File([syntheticPng()], "photo.png", { type: "image/jpeg" })],
    ["MIME 누락", new File([syntheticPng()], "photo.png")],
  ])("%s 파일을 저장 전에 거절한다", async (_label, file) => {
    const result = await run(form(field, file));
    expect(result).toMatchObject({ success: false, fieldErrors: expect.objectContaining({ [field]: expect.any(String) }) });
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.insertValues).not.toHaveBeenCalled();
    expect(mocks.updateSet).not.toHaveBeenCalled();
  });

  it("구형 서버 요청 크기 제한을 넘으면 저장하지 않는다", async () => {
    const bytes = new Uint8Array((prefix === "cohorts" ? 4 : 3) * 1024 * 1024 + 1);
    bytes.set(syntheticPng());
    const result = await run(form(field, new File([bytes], "large.png", { type: "image/png" })));
    expect(result).toMatchObject({ success: false });
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("실제 합성 PNG를 UUID 경로와 서버 MIME으로 원장에 기록해 저장한다", async () => {
    // 생성 액션에서만 존재 확인 결과를 비워 새 글 삽입 경로를 실행합니다.
    if (name === "수료생 생성") mocks.limit.mockResolvedValueOnce([]);
    await run(form(field, new File([syntheticPng()], "개인파일명.png", { type: "image/png" })));
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.put).toHaveBeenCalledOnce();
    if (name === "수료생 생성") {
      expect(mocks.recordOwnedBlob).toHaveBeenCalledOnce();
    } else {
      expect(mocks.reserve).toHaveBeenCalledOnce();
      expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(mocks.put.mock.invocationCallOrder[0]);
    }
    const [path, bytes, options] = mocks.put.mock.calls[0];
    expect(path).toMatch(new RegExp(`^${prefix}/[0-9a-f-]{36}\\.${webp ? "webp" : "png"}$`));
    expect(options.contentType).toBe(webp ? "image/webp" : "image/png");
    if (webp) expect((await sharp(bytes).metadata()).format).toBe("webp");
  });
});

describe("기능별 이미지 계약과 변환 실패", () => {
  it("교수는 GIF를 거절하고 포스터는 같은 실제 GIF 바이트를 허용한다", async () => {
    const gif = new File([Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64")], "photo.gif", { type: "image/gif" });
    expect(await validateAdminImage(gif, facultyImageRule)).toBeNull();
    expect(await validateAdminImage(gif, posterImageRule)).toMatchObject({ extension: "gif", contentType: "image/gif" });
  });

  it.each([updateRecruitmentSettings, updateRecruitmentPoster])("헤더만 맞는 손상된 포스터는 원본을 저장하지 않고 폼 오류를 돌려준다", async action => {
    const file = new File([syntheticPng().slice(0, 12)], "damaged.png", { type: "image/png" });
    expect(await action(form("posterFile", file))).toMatchObject({ success: false, fieldErrors: { posterFile: expect.any(String) } });
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("교수와 수료생의 직접 URL 경로는 실물 검사를 유지하고 서버 파일을 올리지 않는다", async () => {
    const faculty = form("image", new File([], ""));
    faculty.set("uploadTargetId", id); faculty.set("uploadedImageUrl", blobUrl);
    await updateFaculty(id, faculty);
    expect(mocks.validateFaculty).toHaveBeenCalledWith(id, id, blobUrl);
    const alumni = form("images", new File([], ""));
    alumni.set("uploadedImageUrls", JSON.stringify([blobUrl]));
    await updateAlumniStory(id, alumni);
    expect(mocks.validateAlumni).toHaveBeenCalledWith(id, id, blobUrl);
    expect(mocks.put).not.toHaveBeenCalled();
  });
});
