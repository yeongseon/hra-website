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
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
});

// 에디터에 마크다운을 넣어 열고, 문서 끝에 한 글자짜리 문단을 추가한 뒤 저장될 값을 돌려준다.
async function openEditAndSave(markdown: string, typed: string): Promise<string> {
  const view = render(createElement(RichTextEditor, { name: "body", defaultValue: markdown }));
  await waitFor(() => {
    if (!view.container.querySelector(".ProseMirror")) throw new Error("에디터가 아직 준비되지 않았습니다.");
  });
  const element = view.container.querySelector(".ProseMirror") as HTMLElement & { editor: Editor };
  const editor = element.editor;
  await act(async () => {
    editor.commands.insertContentAt(editor.state.doc.content.size, {
      type: "paragraph",
      content: [{ type: "text", text: typed }],
    });
  });
  const hidden = view.container.querySelector<HTMLInputElement>('input[type="hidden"][name="body"]');
  if (!hidden) throw new Error("저장용 hidden input 을 찾지 못했습니다.");
  const value = hidden.value;
  cleanup();
  return value;
}

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
    const tableOf = (markdown: string) =>
      markdown
        .split("\n")
        .filter((line) => line.trim().startsWith("|"))
        .map((line) => line.replace(/\s+/g, " ").trim());

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
});
