/**
 * #269: 수정된 ProseMirror의 일반 붙여넣기와 Markdown 저장·재개방 호환성을 검증합니다.
 * 실제 RichTextEditor와 DOM paste 이벤트를 사용하며 업로드·네트워크는 실행하지 않습니다.
 * 텍스트·일반 HTML·이미지·표만 다루며 취약점 악용이나 공격 입력의 재현 테스트는 아닙니다.
 */
import { createElement } from "react";
import type { Editor } from "@tiptap/core";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const uploads = vi.hoisted(() => ({ uploadEditorImage: vi.fn() }));
vi.mock("@/lib/editor-image-upload-client", () => ({ uploadEditorImage: uploads.uploadEditorImage }));
import { RichTextEditor } from "@/components/admin/rich-text-editor";

beforeAll(() => {
  // jsdom에 없는 위치 계산 API만 보충하고 ProseMirror의 붙여넣기 구현은 그대로 실행합니다.
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  const rectangle = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => rectangle;
  document.elementFromPoint = () => null;
});
afterEach(() => { cleanup(); uploads.uploadEditorImage.mockReset(); });

const cases = [
  { name: "일반 텍스트", text: "일반 텍스트 붙여넣기", html: "", expected: ["일반 텍스트 붙여넣기"] },
  { name: "굵게·링크 HTML", text: "일반 굵게와 안내", html: '<p>일반 <strong>굵게</strong>와 <a href="/faq">안내</a></p>', expected: ["**굵게**", "[안내](/faq)"] },
  { name: "이미지 HTML", text: "", html: '<img src="/images/paste-qa.png" alt="합성 사진" title="일반 이미지">', expected: ["/images/paste-qa.png"] },
  { name: "표 HTML", text: "항목\t설명\n일반 표\t굵은 셀", html: "<table><thead><tr><th>항목</th><th>설명</th></tr></thead><tbody><tr><td>일반 표</td><td><strong>굵은 셀</strong></td></tr></tbody></table>", expected: ["항목", "일반 표", "**굵은 셀**"] },
];

/** 실제 저장용 hidden input과 ProseMirror 인스턴스를 가져옵니다. */
async function open(markdown = "") {
  const view = render(createElement(RichTextEditor, { name: "body", defaultValue: markdown }));
  await waitFor(() => expect(view.container.querySelector(".ProseMirror")).not.toBeNull());
  const element = view.container.querySelector(".ProseMirror") as HTMLElement & { editor: Editor };
  const saved = () => view.container.querySelector<HTMLInputElement>('input[name="body"]')?.value ?? "";
  return { view, element, editor: element.editor, saved };
}

/** 일반 HTML의 서식·이미지 속성·표 구조가 붙여넣기와 재개방 양쪽에서 유지되어야 합니다. */
function expectContent(editor: Editor, name: string) {
  const html = editor.getHTML();
  if (name === "일반 텍스트") expect(editor.getText()).toContain("일반 텍스트 붙여넣기");
  if (name === "굵게·링크 HTML") {
    expect(html).toContain("<strong>굵게</strong>");
    expect(html).toContain('href="/faq"');
  }
  if (name === "이미지 HTML") {
    const images: Array<Record<string, unknown>> = [];
    editor.state.doc.descendants(node => { if (node.type.name === "image") images.push(node.attrs); });
    expect(images).toEqual([expect.objectContaining({ src: "/images/paste-qa.png", alt: "합성 사진", title: "일반 이미지" })]);
  }
  if (name === "표 HTML") {
    let tables = 0;
    editor.state.doc.descendants(node => {
      if (node.type.name !== "table") return;
      tables++;
      expect(node.childCount).toBe(2);
      expect(node.firstChild?.childCount).toBe(2);
    });
    expect(tables).toBe(1);
    expect(html).toContain("<strong>굵은 셀</strong>");
  }
}

describe("RichTextEditor 일반 붙여넣기 호환성", () => {
  it.each(cases)("$name을 실제 paste 경로로 넣고 저장 후 다시 열어도 유지한다", async ({ name, text, html, expected }) => {
    const first = await open();
    await act(async () => {
      first.editor.commands.focus();
      fireEvent.paste(first.element, {
        clipboardData: { getData: (type: string) => type === "text/html" ? html : type === "text/plain" ? text : "", items: [], files: [], types: ["text/plain", "text/html"] },
      });
    });
    expectContent(first.editor, name);
    expect(first.saved().length).toBeGreaterThan(0);
    for (const value of expected) expect(first.saved()).toContain(value);
    const saved = first.saved();
    first.view.unmount();
    const reopened = await open(saved);
    expectContent(reopened.editor, name);
    // HTML에 포함된 이미지는 일반 붙여넣기로 처리하며 Blob 업로드를 중복 실행하지 않습니다.
    expect(uploads.uploadEditorImage).not.toHaveBeenCalled();
  });
});
