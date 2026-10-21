/** 실제 에디터의 접근 가능한 미리보기 이름·본문·닫기와 저장값 보존을 검증합니다 (#296). */
import { createElement } from "react";
import type { Editor } from "@tiptap/core";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RichTextEditor } from "@/components/admin/rich-text-editor";

beforeAll(() => {
  // ProseMirror가 사용하는 위치 계산 API만 jsdom에 보충합니다. 실제 포커스 순환은 Chromium에서 검증합니다.
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  const rectangle = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => rectangle;
  document.elementFromPoint = () => null;
});
afterEach(cleanup);

const title = "미리보기 — 실제 홈페이지와 동일한 렌더링";
const body = "## 검증 본문\n\n![합성 이미지](/images/qa.png)\n\n| 항목 | 값 |\n| --- | --- |\n| 이름 | 설명 |";

describe("RichTextEditor 접근 가능한 전체화면 미리보기", () => {
  it.each(["Escape", "닫기"])("%s로 닫아도 저장값과 한국어 레이블을 유지한다", async (method) => {
    const view = render(createElement(RichTextEditor, { name: "body", defaultValue: body, previewTitle: "검증 제목" }));
    await waitFor(() => expect(view.container.querySelector(".ProseMirror")).not.toBeNull());
    const element = view.container.querySelector(".ProseMirror") as HTMLElement & { editor: Editor };
    // 실제 편집 후 정규화된 저장값을 기준으로 삼아 단순 초기 Markdown 공백 차이는 제외합니다.
    await act(async () => {
      element.editor.commands.insertContentAt(element.editor.state.doc.content.size, { type: "paragraph", content: [{ type: "text", text: "편집 내용" }] });
    });
    const saved = view.container.querySelector<HTMLInputElement>('input[name="body"]')?.value;
    const trigger = view.getByTitle("미리보기 (홈페이지 렌더링)");
    trigger.focus(); fireEvent.click(trigger);
    const dialog = await view.findByRole("dialog", { name: title });
    expect(view.getByRole("heading", { name: /^검증 제목$/ })).toBeTruthy();
    expect(view.getByRole("table")).toBeTruthy();
    expect(view.getByRole("img", { name: "합성 이미지" })).toBeTruthy();
    expect(view.getByRole("region", { name: /^미리보기 본문$/ }).tabIndex).toBe(0);
    const close = view.getByRole("button", { name: /^✕ 편집으로 돌아가기$/ });
    if (method === "Escape") fireEvent.keyDown(dialog, { key: "Escape" });
    else fireEvent.click(close);
    await waitFor(() => expect(view.queryByRole("dialog", { name: title })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(view.container.querySelector<HTMLInputElement>('input[name="body"]')?.value).toBe(saved);
  });
});
