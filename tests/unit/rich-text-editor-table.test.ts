/**
 * 마크다운 에디터 표 round-trip 회귀 테스트 (#118)
 *
 * 검증 대상 (src/components/admin/rich-text-editor.tsx):
 *   표가 들어 있는 글을 열어 다른 곳을 한 글자 고치고 저장해도, 표 셀 안의 굵게·링크·줄바꿈이
 *   그대로 남는다. 다시 열어 한 번 더 저장해도 달라지지 않는다 (손상이 누적되지 않는다).
 *
 * 실제 RichTextEditor 컴포넌트를 jsdom 에 올려, 화면 저장에 쓰이는 hidden input 값을 읽는다.
 * 이 저장소의 단위 테스트는 .ts 만 수집하므로 JSX 대신 createElement 를 쓴다.
 */

import { createElement } from "react";
import type { Editor } from "@tiptap/core";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
const uploadMocks = vi.hoisted(() => ({ uploadEditorImage: vi.fn() }));
vi.mock("@/lib/editor-image-upload-client", () => ({ uploadEditorImage: uploadMocks.uploadEditorImage }));
import { RichTextEditor } from "@/components/admin/rich-text-editor";

beforeAll(() => {
  // ProseMirror 가 사용하는데 jsdom 에 없는 API 를 채운다.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const emptyRect = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => emptyRect;
  document.elementFromPoint = () => null;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  uploadMocks.uploadEditorImage.mockReset();
});

// 에디터에 마크다운을 넣어 열고, edit 로 편집한 뒤 저장될 값(hidden input)을 돌려준다.
// edit 를 주지 않으면 문서 끝에 한 글자짜리 문단을 추가한다 ("다른 곳의 오타 수정" 상황).
async function openEditAndSave(
  markdown: string,
  typed: string,
  edit?: (editor: Editor) => void,
): Promise<string> {
  const view = render(createElement(RichTextEditor, { name: "body", defaultValue: markdown }));
  await waitFor(() => {
    if (!view.container.querySelector(".ProseMirror")) throw new Error("에디터가 아직 준비되지 않았습니다.");
  });
  const element = view.container.querySelector(".ProseMirror") as HTMLElement & { editor: Editor };
  const editor = element.editor;
  await act(async () => {
    if (edit) {
      edit(editor);
    } else {
      editor.commands.insertContentAt(editor.state.doc.content.size, {
        type: "paragraph",
        content: [{ type: "text", text: typed }],
      });
    }
  });
  const hidden = view.container.querySelector<HTMLInputElement>('input[type="hidden"][name="body"]');
  if (!hidden) throw new Error("저장용 hidden input 을 찾지 못했습니다.");
  const value = hidden.value;
  cleanup();
  return value;
}

// 마크다운에서 표 줄만 뽑아 공백을 정리한다 (열 맞춤용 공백 차이는 비교하지 않는다).
const tableOf = (markdown: string) =>
  markdown
    .split("\n")
    .filter((line) => line.trim().startsWith("|"))
    .map((line) => line.replace(/\s+/g, " ").trim());

const SOURCE = [
  "앞 문단",
  "",
  "| 항목 | 값 |",
  "| --- | --- |",
  "| 이름 | **굵게** |",
  "| 링크 | [사이트](https://example.com) |",
  "| 조원 | 김철수<br>이영희 |",
  "",
  "뒤 문단",
].join("\n");

describe("RichTextEditor — 표 셀 서식 보존", () => {
  it("한 번 저장해도 굵게·링크가 이스케이프되지 않는다", async () => {
    const saved = await openEditAndSave(SOURCE, "x");

    expect(saved).toContain("**굵게**");
    expect(saved).toContain("[사이트](https://example.com)");
    expect(saved).not.toContain("\\*");
    expect(saved).not.toContain("\\[");
    expect(saved).not.toContain("&lt;");
    expect(saved).not.toContain("&amp;");
  });

  it("셀 안 줄바꿈이 <br> 로 보존된다", async () => {
    const saved = await openEditAndSave(SOURCE, "x");
    const row = saved.split("\n").find((line) => line.includes("김철수"));

    expect(row).toBeDefined();
    expect(row).toContain("김철수<br>이영희");
    expect(row).not.toContain("&lt;br");
  });

  it("다시 열어 한 번 더 저장해도 표 내용이 달라지지 않는다", async () => {
    const first = await openEditAndSave(SOURCE, "x");
    const second = await openEditAndSave(first, "y");

    expect(tableOf(second)).toEqual(tableOf(first));
    expect(tableOf(first).length).toBeGreaterThanOrEqual(5);
  });

  it("표 하나만 있는 글도 손상되지 않는다", async () => {
    const onlyTable = ["| 항목 | 값 |", "| --- | --- |", "| 이름 | **굵게** |"].join("\n");
    const saved = await openEditAndSave(onlyTable, "x");

    expect(saved).toContain("**굵게**");
    expect(saved).not.toContain("\\*");
  });

  it("빈 셀이 있는 표를 두 번 저장해도 &nbsp; 가 글자로 바뀌지 않는다", async () => {
    const withEmptyCell = ["| 항목 | 값 |", "| --- | --- |", "| 이름 | |"].join("\n");
    const first = await openEditAndSave(withEmptyCell, "x");
    const second = await openEditAndSave(first, "y");

    expect(second).not.toContain("&amp;");
    expect(tableOf(second)).toEqual(tableOf(first));
  });

  it("셀 안의 이미지가 저장에서 사라지지 않는다", async () => {
    // 표를 만들고 본문 셀에 글자와 이미지를 넣는다 (이미지는 자식이 없는 블록 노드다).
    const saved = await openEditAndSave("", "", (editor) => {
      editor.chain().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
      let bodyCell = -1;
      editor.state.doc.descendants((node, pos) => {
        if (bodyCell === -1 && node.type.name === "tableCell") bodyCell = pos;
      });
      editor
        .chain()
        .setTextSelection(bodyCell + 2)
        .insertContent("설명")
        .setImage({ src: "https://example.com/y.png", alt: "a" })
        .run();
    });

    expect(saved).toContain("설명");
    expect(saved).toContain("![a](https://example.com/y.png)");
  });

  it("한 셀의 여러 문단은 <br> 로 이어서 저장한다", async () => {
    const saved = await openEditAndSave("", "", (editor) => {
      editor.chain().insertTable({ rows: 2, cols: 1, withHeaderRow: true }).run();
      let bodyCell = -1;
      editor.state.doc.descendants((node, pos) => {
        if (bodyCell === -1 && node.type.name === "tableCell") bodyCell = pos;
      });
      editor
        .chain()
        .setTextSelection(bodyCell + 2)
        .insertContent([
          { type: "paragraph", content: [{ type: "text", text: "문단1" }] },
          { type: "paragraph", content: [{ type: "text", text: "문단2" }] },
        ])
        .run();
    });

    expect(saved).toContain("문단1<br>문단2");
  });

  it("본문에 사설 영역 문자가 있어도 줄바꿈으로 바뀌지 않는다", async () => {
    const privateUse = "\uE000";
    const source = ["| 항목 | 값 |", "| --- | --- |", `| 이름 | 가${privateUse}나 |`].join("\n");
    const saved = await openEditAndSave(source, "x");
    const row = saved.split("\n").find((line) => line.includes("이름"));

    expect(row).toContain(`가${privateUse}나`);
    expect(row).not.toContain("<br>");
  });
});

describe("RichTextEditor — 이미지 붙여넣기", () => {
  const file = new File(["image"], "clipboard.png", { type: "image/png" });

  async function editorElement() {
    const view = render(createElement(RichTextEditor, { name: "body", defaultValue: "" }));
    await waitFor(() => {
      if (!view.container.querySelector(".ProseMirror")) throw new Error("에디터가 아직 준비되지 않았습니다.");
    });
    const element = view.container.querySelector(".ProseMirror");
    if (!element) throw new Error("에디터 영역을 찾지 못했습니다.");
    return element;
  }

  function clipboardData(text: string, html = "") {
    return {
      items: [{ kind: "file", type: "image/png", getAsFile: () => file }],
      getData: (format: string) => format === "text/plain" ? text : format === "text/html" ? html : "",
    };
  }

  it("텍스트와 이미지가 함께 있으면 기본 텍스트 붙여넣기를 유지하고 이미지를 업로드하지 않는다", async () => {
    const element = await editorElement();

    fireEvent.paste(element, { clipboardData: clipboardData("표 셀 텍스트") });

    expect(uploadMocks.uploadEditorImage).not.toHaveBeenCalled();
    expect(element.textContent).toContain("표 셀 텍스트");
  });

  it("HTML 과 이미지가 함께 있으면 기본 HTML 붙여넣기를 유지한다", async () => {
    const element = await editorElement();

    fireEvent.paste(element, { clipboardData: clipboardData("", "<table><tbody><tr><td>표 셀 텍스트</td></tr></tbody></table>") });

    expect(uploadMocks.uploadEditorImage).not.toHaveBeenCalled();
    expect(element.textContent).toContain("표 셀 텍스트");
  });

  it("이미지만 있으면 이미지 업로드를 시작한다", async () => {
    // 이 테스트는 붙여넣기 분기만 검증합니다. 에디터가 언마운트된 뒤
    // ProseMirror focus 타이머가 실행되지 않도록 업로드 완료는 보류합니다.
    uploadMocks.uploadEditorImage.mockImplementation(() => new Promise(() => {}));
    const element = await editorElement();

    const notCancelled = fireEvent.paste(element, { clipboardData: clipboardData("") });

    expect(notCancelled).toBe(false);
    await waitFor(() => expect(uploadMocks.uploadEditorImage).toHaveBeenCalledExactlyOnceWith(file));
  });
});
