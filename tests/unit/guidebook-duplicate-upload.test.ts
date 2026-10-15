/**
 * #110 같은 한글 파일명을 반복해도 직접 업로드 경로가 고유하고,
 * Server Action으로 대용량 File 객체를 다시 보내지 않는지 확인합니다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@vercel/blob/client", () => ({ upload: mocks.upload }));

import { prepareResourceUpload } from "@/lib/resource-upload-client";

describe("가이드북 중복 파일명 업로드", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.upload.mockImplementation(async (pathname: string) => ({ url: `https://blob.example/${pathname}` }));
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ access: "public" })));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("같은 한글 PDF 이름 두 번을 다른 경로로 보내고 액션에서는 파일 본문을 제거한다", async () => {
    const paths: string[] = [];
    for (let index = 0; index < 2; index += 1) {
      const formData = new FormData();
      formData.set("title", `가이드북 ${index + 1}`);
      formData.set("file", new File(["%PDF-1.4\n"], "가이드북.pdf", { type: "application/pdf" }));
      const prepared = await prepareResourceUpload(formData, "guidebooks", "11111111-1111-4111-8111-111111111111", true);
      expect("error" in prepared).toBe(false);
      if ("error" in prepared) continue;
      expect(prepared.formData.has("file")).toBe(false);
      expect(prepared.formData.get("uploadedFileName")).toBe("가이드북.pdf");
      paths.push(String(prepared.formData.get("uploadedFileUrl")));
    }

    expect(paths).toHaveLength(2);
    expect(paths[0]).not.toBe(paths[1]);
    for (const call of mocks.upload.mock.calls) {
      expect(call[0]).toMatch(/^resource-uploads\/guidebooks\/11111111-1111-4111-8111-111111111111\/[0-9a-f-]+\/document\.pdf$/);
      expect(call[2]).toMatchObject({ access: "public", contentType: "application/pdf" });
    }
  });
});
