"use client";

import { useEditor, EditorContent, useEditorState, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Paragraph } from "@tiptap/extension-paragraph";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
// Table, TableRow 등은 단일 패키지에서 named export로 제공됨
import { Table, TableRow, TableCell, TableHeader, renderTableToMarkdown } from "@tiptap/extension-table";
import type { JSONContent } from "@tiptap/core";

/** 이미지 크기 조정 프리셋 — null 은 "원본(크기 제한 없음)"을 의미한다 */
const SIZE_PRESETS = [
  { label: "25%", value: "25%" },
  { label: "50%", value: "50%" },
  { label: "75%", value: "75%" },
  { label: "원본", value: null },
] as const;

/**
 * 에디터 이미지 노드 뷰
 *
 * 이미지를 클릭(선택)하면:
 * - 상단에 크기 조정 툴바(프리셋 버튼 + 숫자 직접 입력) 플로팅 표시
 * - 오른쪽 가장자리에 드래그 핸들 표시 — 좌우로 드래그해 자유롭게 크기 조절
 * - 드래그 중에는 이미지 위에 현재 퍼센트 배지가 실시간으로 표시됨
 *
 * useState/useEffect/useRef 는 모듈 레벨 import가 ES module 호이스팅으로 전체에 적용됨
 */
function ImageResizeView({ node, selected, updateAttributes, deleteNode }: ReactNodeViewProps) {
  const attrs = node.attrs as { src: string; alt: string | null; width: string | null };

  // 숫자 입력 필드 상태 — "50%" → "50", null → ""
  const [customInput, setCustomInput] = useState<string>(() =>
    attrs.width ? attrs.width.replace("%", "") : ""
  );
  // 드래그 진행 중 여부
  const [isDragging, setIsDragging] = useState(false);
  // 드래그 중 실시간 너비 ("67%") — null이면 저장된 attrs.width 사용
  const [liveWidth, setLiveWidth] = useState<string | null>(null);

  // 이미지 컨테이너 ref — 드래그 시작 시 offsetWidth 및 부모 너비 측정
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);     // 드래그 시작 마우스 X 좌표
  const startWidthRef = useRef(0); // 드래그 시작 시 컨테이너 픽셀 너비

  // 입력값을 파싱해 width 속성 적용 (1~100 클램프, 빈값·0이면 원본)
  function applyCustomWidth(raw: string) {
    const num = parseInt(raw, 10);
    if (isNaN(num) || num <= 0) {
      updateAttributes({ width: null });
      setCustomInput("");
    } else {
      const clamped = Math.min(100, Math.max(1, num));
      updateAttributes({ width: `${clamped}%` });
      setCustomInput(String(clamped));
    }
  }

  // 프리셋 버튼 클릭 — TipTap 속성과 입력 필드를 동시에 업데이트
  // (useEffect로 attrs.width 변화를 감지하는 대신 직접 동기화해 cascading render 방지)
  function applyPreset(value: string | null) {
    updateAttributes({ width: value });
    setCustomInput(value ? value.replace("%", "") : "");
  }

  // 드래그 핸들 mousedown: document에 mousemove/mouseup을 달아 드래그 추적
  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const container = containerRef.current;
    if (!container) return;

    startXRef.current = e.clientX;
    startWidthRef.current = container.offsetWidth;
    // 에디터 단락(부모 블록) 너비를 100% 기준으로 사용
    const parentWidth = container.parentElement?.offsetWidth ?? container.offsetWidth;
    setIsDragging(true);

    function onMouseMove(ev: MouseEvent) {
      const delta = ev.clientX - startXRef.current;
      const newPct = Math.min(100, Math.max(10, Math.round(((startWidthRef.current + delta) / parentWidth) * 100)));
      setLiveWidth(`${newPct}%`);
    }

    function onMouseUp(ev: MouseEvent) {
      const delta = ev.clientX - startXRef.current;
      const newPct = Math.min(100, Math.max(10, Math.round(((startWidthRef.current + delta) / parentWidth) * 100)));
      // 드래그 확정 시 TipTap 속성과 입력 필드 동시 업데이트
      updateAttributes({ width: `${newPct}%` });
      setCustomInput(String(newPct));
      setLiveWidth(null);
      setIsDragging(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  // 화면에 보여줄 너비: 드래그 중이면 실시간값, 아니면 저장된 값
  const displayWidth = liveWidth ?? attrs.width;

  return (
    <NodeViewWrapper className="relative my-4 block">
      {/* 크기 조정 툴바 + 삭제 버튼 — 선택되거나 드래그 중일 때 표시 */}
      {(selected || isDragging) && (
        <div className="absolute left-0 top-0 z-10 flex items-center gap-1 rounded-lg border border-[#D9D9D9] bg-white p-1 shadow-md">
          {SIZE_PRESETS.map(({ label, value }) => (
            <button
              key={label}
              type="button"
              onClick={() => applyPreset(value)}
              className={cn(
                "rounded px-2 py-1 text-xs font-medium transition-colors",
                (value === null && !attrs.width) || value === attrs.width
                  ? "bg-[#2563EB] text-white"
                  : "text-[#666666] hover:bg-gray-100 hover:text-[#1a1a1a]",
              )}
            >
              {label}
            </button>
          ))}
          <div className="mx-0.5 h-4 w-px bg-gray-200" />
          {/* 숫자 직접 입력 */}
          <div className="flex items-center gap-0.5">
            <input
              type="number"
              min={1}
              max={100}
              value={customInput}
              placeholder="직접"
              onChange={(e) => setCustomInput(e.target.value)}
              onBlur={(e) => applyCustomWidth(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyCustomWidth(customInput);
                }
              }}
              className="w-14 rounded border border-[#D9D9D9] px-1.5 py-1 text-xs text-[#1a1a1a] focus:border-[#2563EB] focus:outline-none"
            />
            <span className="text-xs text-[#666666]">%</span>
          </div>
          {/* 이미지 삭제 버튼 */}
          {selected && (
            <>
              <div className="mx-0.5 h-4 w-px bg-gray-200" />
              <button
                type="button"
                onClick={() => deleteNode()}
                className="rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                title="이미지 삭제"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      )}

      {/* 이미지 컨테이너 — 너비 스타일이 이 div에 적용되고 img는 항상 w-full */}
      <div
        ref={containerRef}
        className="relative inline-block"
        style={displayWidth ? { width: displayWidth } : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attrs.src ?? ""}
          alt={attrs.alt ?? ""}
          draggable={false}
          className={cn(
            "block w-full rounded-xl border border-[#D9D9D9] shadow-sm",
            // 드래그 중 이미지 자체의 마우스 이벤트 차단 (핸들에서 포커스 벗어남 방지)
            isDragging && "pointer-events-none select-none",
          )}
        />

        {/* 드래그 중 현재 크기 배지 */}
        {isDragging && displayWidth && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
            <span className="rounded-md bg-black/60 px-3 py-1 text-sm font-semibold text-white">
              {displayWidth}
            </span>
          </div>
        )}

        {/* 오른쪽 상단 드래그 핸들 */}
        {(selected || isDragging) && (
          <div
            onMouseDown={handleResizeStart}
            className="absolute -right-1.5 -top-1.5 z-20 flex h-5 w-5 cursor-nwse-resize items-center justify-center rounded-full border border-[#D9D9D9] bg-white shadow-md hover:border-[#2563EB] hover:bg-blue-50"
          >
            <div className="h-2 w-2 rounded-sm border-r-2 border-t-2 border-gray-400" />
          </div>
        )}

      </div>
    </NodeViewWrapper>
  );
}

/**
 * 빈 단락 마크다운 직렬화 확장
 *
 * 기본 @tiptap/extension-paragraph 는 직전 노드가 비-빈 단락이면 빈 단락을 ""로 직렬화해
 * 공개 페이지에 빈 줄 간격이 반영되지 않는다.
 * 빈 단락을 항상 &nbsp;로 직렬화해 공개 페이지에서도 줄 간격을 보존한다.
 */
const MarkdownParagraph = Paragraph.extend({
  // 빈 단락(내용 없음) → &nbsp; 로 직렬화 (공개 페이지 줄 간격 보존)
  // 비-빈 단락 → 기본 동작 유지 (helpers.renderChildren 호출)
  renderMarkdown(node, helpers) {
    const content = Array.isArray(node.content) ? node.content : [];
    if (content.length === 0) return "&nbsp;";
    return helpers.renderChildren(content);
  },
});

/**
 * 표(GFM 테이블) 마크다운 직렬화·역직렬화 확장
 *
 * @tiptap/markdown 은 table 노드를 기본 지원하지 않으므로 직접 구현한다.
 * - renderMarkdown: TipTap table 노드 → GFM 마크다운 표 (`| 헤더 | ... |`)
 * - parseMarkdown: marked 의 "table" 토큰 → TipTap table 노드 JSON
 */
type MarkedTableToken = {
  header: Array<{ text: string }>;
  rows: Array<Array<{ text: string }>>;
};

// 표 스트립 방향 — 오른쪽(열 추가) or 아래쪽(행 추가)
type TableEdge = "right" | "bottom";

// 표 스트립 절대 좌표 (에디터 콘텐츠 컨테이너 기준)
type TableBounds = {
  top: number; left: number; right: number; bottom: number;
  width: number; height: number;
};

// ─ HTML 직렬화 헬퍼 — colwidth가 있는 표를 HTML로 저장해 공개 페이지에서 열 너비 비율을 보존 ─

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeHtmlAttr(str: string): string {
  return str.replace(/"/g, "&quot;");
}

// JSONContent 단락(paragraph) 노드의 인라인 자식들을 HTML 문자열로 변환
// bold / italic / strike / code / link / hardBreak 지원
// renderMarkdown 콜백은 실제로 JSONContent(plain object)를 전달하므로 배열 API 사용
function inlineNodesToHtml(blockNode: JSONContent): string {
  let html = "";
  for (const inline of (blockNode.content ?? [])) {
    if (inline.type === "hardBreak") { html += "<br>"; continue; }
    if (inline.type !== "text") continue;
    let text = escapeHtml(inline.text ?? "");
    for (const mark of (inline.marks ?? [])) {
      if (mark.type === "code")        text = `<code>${text}</code>`;
      else if (mark.type === "bold")   text = `<strong>${text}</strong>`;
      else if (mark.type === "italic") text = `<em>${text}</em>`;
      else if (mark.type === "strike") text = `<s>${text}</s>`;
      else if (mark.type === "link") {
        const href = escapeHtmlAttr(String(mark.attrs?.href ?? ""));
        text = `<a href="${href}">${text}</a>`;
      }
    }
    html += text;
  }
  return html;
}

/**
 * TipTap table JSONContent → HTML 문자열 직렬화 (colwidth 있을 때 사용)
 *
 * - <colgroup><col width="X%"> 로 열 너비 비율을 공개 페이지에 보존
 * - 각 셀에 colwidth="N" 속성을 포함해 에디터 재편집 시 round-trip 복원
 *   (TipTap TableCell.parseHTML 이 colwidth 속성을 읽어 colwidth: [N] 으로 복원)
 */
function renderTableAsHtml(tableNode: JSONContent): string {
  const rows = tableNode.content ?? [];
  const firstRow = rows[0];
  if (!firstRow) return "";

  // 첫 행 기준 열 너비(px) 수집
  const colwidths: number[] = [];
  for (const cell of (firstRow.content ?? [])) {
    colwidths.push((cell.attrs?.colwidth as number[] | null)?.[0] ?? 0);
  }
  const totalWidth = colwidths.reduce((a, b) => a + b, 0);

  let html = "<table>\n";

  // colgroup — 절대 픽셀값을 그대로 사용해 공개 페이지에서 편집 시 설정한 너비 그대로 보존
  // (prose-table:w-full 을 [&_table:has(colgroup)]:w-auto 로 해제하므로 table-layout:fixed
  //  + 절대 픽셀 col 로 원본 크기가 재현됨)
  if (totalWidth > 0) {
    html += "<colgroup>";
    for (const w of colwidths) {
      html += `<col width="${w}">`;
    }
    html += "</colgroup>\n";
  }

  let bodyOpened = false;
  rows.forEach((row, rowIdx) => {
    const isHeaderRow = (row.content ?? [])[0]?.type === "tableHeader";
    if (rowIdx === 0 && isHeaderRow) {
      html += "<thead>";
    } else if (!bodyOpened) {
      html += "<tbody>";
      bodyOpened = true;
    }

    html += "<tr>";
    for (const cell of (row.content ?? [])) {
      const tag = cell.type === "tableHeader" ? "th" : "td";
      const cw = (cell.attrs?.colwidth as number[] | null)?.[0];
      const cwAttr = cw ? ` colwidth="${cw}"` : ""; // round-trip 복원용
      let cellHtml = "";
      let paragraphIdx = 0;
      for (const block of (cell.content ?? [])) {
        if (paragraphIdx > 0) cellHtml += "<br>";
        cellHtml += inlineNodesToHtml(block);
        paragraphIdx++;
      }
      html += `<${tag}${cwAttr}>${cellHtml}</${tag}>`;
    }
    html += "</tr>";

    if (rowIdx === 0 && isHeaderRow) html += "</thead>\n";
  });

  if (bodyOpened) html += "</tbody>\n";
  html += "</table>";
  return html;
}

const MarkdownTable = Table.configure({ resizable: true }).extend({
  // @tiptap/markdown 에 "table" 토큰을 이 확장이 처리함을 등록
  markdownTokenName: "table",

  // TipTap table 노드 → 마크다운/HTML 직렬화
  // colwidth 가 있으면 <colgroup> 포함 HTML 로 저장해 공개 페이지 열 너비 보존
  // colwidth 없으면 기존 GFM 마크다운 형식 유지
  renderMarkdown(node, helpers) {
    // node 는 JSONContent(plain object) — content 는 배열이므로 배열 API 사용
    const firstRowFirstCell = (node.content ?? [])[0]?.content?.[0];
    const hasColWidths = !!((firstRowFirstCell?.attrs?.colwidth as number[] | null)?.[0]);
    if (hasColWidths) return renderTableAsHtml(node);
    return renderTableToMarkdown(node, helpers);
  },

  // marked "table" 토큰 → TipTap 노드 JSON
  parseMarkdown(token) {
    const t = token as MarkedTableToken;

    const toCell = (text: string, cellType: "tableHeader" | "tableCell") => ({
      type: cellType,
      content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }],
    });

    return {
      type: "table",
      content: [
        { type: "tableRow", content: t.header.map((cell) => toCell(cell.text, "tableHeader")) },
        ...t.rows.map((row) => ({
          type: "tableRow",
          content: row.map((cell) => toCell(cell.text, "tableCell")),
        })),
      ],
    };
  },
});

// @tiptap/extension-image 는 TipTap 렌더링만 처리하고 @tiptap/markdown 직렬화 훅이 없다.
// 그 결과 editor.getMarkdown() 호출 시 이미지가 조용히 누락되어 DB에 저장되지 않는다.
// Image.extend()로 renderMarkdown / parseMarkdown 을 추가해 직렬화를 활성화하고,
// width 속성과 NodeView(ImageResizeView)를 추가해 크기 조정 기능을 지원한다.
const MarkdownImage = Image.extend({
  addAttributes() {
    const parent = this.parent?.() ?? {};
    return {
      ...parent,
      // 이미지 표시 너비 — "50%" 형식, null이면 원본
      width: {
        default: null,
        // <img style="width: 50%"> 로부터 파싱
        parseHTML: (element: HTMLElement) => element.style.width || null,
        // TipTap 에디터 내부 HTML 직렬화 (붙여넣기·드래그 용)
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.width ? { style: `width: ${attrs.width as string}` } : {},
      },
    };
  },

  // TipTap 이미지 노드 → 마크다운 또는 HTML img 태그
  // 크기가 지정된 경우 <img> HTML로 직렬화 → 표시 측 rehype-raw 가 파싱
  renderMarkdown(node) {
    const src = (node.attrs?.src as string) ?? "";
    const alt = (node.attrs?.alt as string) ?? "";
    const width = node.attrs?.width as string | null;
    const title = node.attrs?.title as string | null;

    if (width) {
      const altAttr = alt ? ` alt="${alt}"` : "";
      return `<img src="${src}"${altAttr} style="width: ${width}" />`;
    }
    return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
  },

  // 마크다운 image 토큰 → TipTap 이미지 노드
  parseMarkdown(token) {
    return {
      type: "image",
      attrs: {
        src: token.href ?? "",
        alt: token.text ?? null,
        title: token.title ?? null,
      },
    };
  },

  // 이미지 클릭 시 크기 조정 UI를 보여주는 React 기반 NodeView 등록
  addNodeView() {
    return ReactNodeViewRenderer(ImageResizeView);
  },
});
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TextSelection } from "@tiptap/pm/state";
import {
  Bold,
  Italic,
  Strikethrough,
  Link as LinkIcon,
  Image as ImageIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Minus,
  Undo,
  Redo,
  FileCode,
  Eye,
  X,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownViewer } from "@/components/markdown/markdown-viewer";

/**
 * 마크다운 리치 텍스트 에디터
 *
 * - 입력: 사용자 키보드/붙여넣기 모두 마크다운 문법(`## 제목`, `- 항목`, `**굵게**`,
 *   `[링크](url)`, ```` ```코드``` ```` 등)을 인식한다.
 * - 출력/저장: `editor.getMarkdown()`을 호출해 마크다운 문자열을 부모로 전달한다.
 * - 툴바: 마크다운 표준에 존재하는 기능만 노출한다. 색상·하이라이트·밑줄·텍스트 정렬은
 *   마크다운에 없으므로 의도적으로 제거했다.
 */
interface RichTextEditorProps {
  id?: string;
  name: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  /** 미리보기 전체화면에 표시할 제목 (폼의 제목 입력값을 전달하면 더 실감나는 미리보기 가능) */
  previewTitle?: string;
}

export function RichTextEditor({
  id,
  name,
  defaultValue = "",
  value,
  onChange,
  placeholder,
  required,
  previewTitle,
}: RichTextEditorProps) {
  const [internalValue, setInternalValue] = useState(value ?? defaultValue);
  // createPortal은 브라우저 전용이므로 클라이언트 마운트 후에만 사용
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR hydration 후 클라이언트 마운트 감지를 위한 패턴
  useEffect(() => { setMounted(true); }, []);

  // 에디터 표시 모드
  // - "edit"   : TipTap WYSIWYG 편집 (기본)
  // - "source" : <textarea> 로 마크다운 소스 직접 편집
  // - "preview": MarkdownViewer 로 실제 홈페이지 렌더링 미리보기
  //
  // 동기화 규칙:
  //   1) edit→source: internalValue 는 이미 onUpdate 로 최신 상태
  //   2) source→edit: textarea 값을 editor.setContent 로 푸시 후 정규화
  //   3) */→preview: 별도 동기화 불필요 — internalValue 를 그대로 렌더링
  //   4) 외부 value prop sync useEffect 는 edit 모드일 때만 실행
  //   5) 툴바 버튼은 edit 모드일 때만 활성화
  const [mode, setMode] = useState<"edit" | "source" | "preview">("edit");
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 에디터 콘텐츠 컨테이너 ref — 표 스트립 절대 좌표 계산 기준
  const editorContentRef = useRef<HTMLDivElement>(null);
  // 이미지 업로드 중 여부 (드래그·붙여넣기 포함)
  const [isUploading, setIsUploading] = useState(false);
  // 표 위치 (에디터 좌표계) — null이면 표 없음 or 마우스 에디터 밖
  const [tableBounds, setTableBounds] = useState<TableBounds | null>(null);
  // 드래그 진행 중 여부 — 드래그 중 mouseleave로 스트립이 숨겨지는 것 방지
  const isDraggingRef = useRef(false);
  // TipTap 내장 열 너비 리사이즈 중 여부 — 리사이즈 중 스트립 깜빡임 방지
  const isColumnResizingRef = useRef(false);
  // 마지막으로 활성화된 <table> 요소 — 여러 표가 있을 때 updateTableBounds 에서 사용
  const lastActiveTableElRef = useRef<Element | null>(null);
  // 드래그 중 행/열 증감 피드백 표시용
  const [dragInfo, setDragInfo] = useState<{ edge: TableEdge; delta: number } | null>(null);

  const editor = useEditor({
    extensions: [
      // paragraph: false — MarkdownParagraph(빈 줄 &nbsp; 직렬화)로 대체
      StarterKit.configure({ paragraph: false }),
      MarkdownParagraph,
      Link.configure({ openOnClick: false }),
      MarkdownImage,
      MarkdownTable,
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({ placeholder: placeholder || "내용을 입력하세요..." }),
      Markdown.configure({
        markedOptions: { gfm: true, breaks: false },
      }),
    ],
    content: value ?? defaultValue,
    contentType: "markdown",
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const markdown = editor.getMarkdown();
      setInternalValue(markdown);
      onChange?.(markdown);
    },
  });

  // 외부에서 controlled `value` prop이 비동기로 변경되는 경우(예: 페이지 로드 직후
  // useEffect 안에서 DB 값을 받아 setState 한 경우), Tiptap 에디터의 내부 상태는
  // 자동으로 동기화되지 않는다. 따라서 `value`가 바뀌고 현재 마크다운과 다를 때만
  // setContent로 강제 갱신한다. emitUpdate=false 로 호출해 onUpdate 무한 루프를 방지한다.
  useEffect(() => {
    if (!editor) return;
    if (value === undefined) return;
    // 소스 모드 중에는 textarea 가 진실 소스이므로 외부 value prop 동기화를 건너뛴다.
    // (controlled 사용처에서 키 입력 → onChange → setState → value prop 변경 → setContent
    //  라운드트립으로 textarea 가 즉시 정규화되는 race 를 방지)
    if (mode !== "edit") return;
    if (value === editor.getMarkdown()) return;
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- emitUpdate:false로 onUpdate를 막았으므로 수동으로 동기화
    setInternalValue(editor.getMarkdown());
  }, [value, editor, mode]);

  // TipTap 내장 열 너비 리사이즈 (.column-resize-handle) 중에는 스트립을 숨겨 깜빡임 방지
  // mousedown → 스트립 숨김 + isColumnResizingRef=true, mouseup → 스트립 복원
  useEffect(() => {
    const container = editorContentRef.current;
    if (!container || mode !== "edit") return;

    function onContainerMouseDown(ev: MouseEvent) {
      if (!(ev.target instanceof Element)) return;
      if (!ev.target.classList.contains("column-resize-handle")) return;

      isColumnResizingRef.current = true;
      setTableBounds(null); // 리사이즈 시작 시 스트립 즉시 숨김

      function onMouseUp() {
        isColumnResizingRef.current = false;
        document.removeEventListener("mouseup", onMouseUp);
        // 리사이즈 완료 후 표 크기가 바뀌었으므로 스트립 위치 재계산
        requestAnimationFrame(() => {
          const tableEl = lastActiveTableElRef.current;
          if (!tableEl || !editorContentRef.current) return;
          const cRect = editorContentRef.current.getBoundingClientRect();
          const wRect = tableEl.getBoundingClientRect();
          setTableBounds({
            top: wRect.top - cRect.top,
            left: wRect.left - cRect.left,
            right: wRect.right - cRect.left,
            bottom: wRect.bottom - cRect.top,
            width: wRect.width,
            height: wRect.height,
          });
        });
      }
      document.addEventListener("mouseup", onMouseUp);
    }

    container.addEventListener("mousedown", onContainerMouseDown);
    return () => container.removeEventListener("mousedown", onContainerMouseDown);
  }, [mode]);

  // 파일을 Vercel Blob에 업로드하고 에디터 커서 위치에 이미지를 삽입한다.
  const uploadAndInsert = useCallback(
    async (file: File) => {
      if (!editor) return;
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload-image", { method: "POST", body: formData });
        const data: { url?: string; error?: string } = await res.json();
        if (data.url) {
          editor.chain().focus().setImage({ src: data.url }).run();
        } else {
          alert(data.error ?? "이미지 업로드에 실패했습니다.");
        }
      } catch (error) {
        console.error("이미지 업로드 실패:", error);
        alert("이미지 업로드에 실패했습니다.");
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [editor]
  );

  // 파일 input 변경 → 업로드
  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void uploadAndInsert(file);
    },
    [uploadAndInsert]
  );

  // 에디터 영역에 이미지 파일을 드래그앤드롭했을 때 업로드
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      const file = e.dataTransfer.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      e.preventDefault();
      void uploadAndInsert(file);
    },
    [uploadAndInsert]
  );

  // 행/열 추가·삭제 후 rAF 안에서 호출해 표 스트립 위치를 최신 DOM 기준으로 갱신
  // lastActiveTableElRef 에 기록된 표를 기준으로 갱신 (여러 표 지원)
  const updateTableBounds = useCallback(() => {
    requestAnimationFrame(() => {
      const container = editorContentRef.current;
      if (!container) return;
      // 마지막으로 활성화된 표 우선, 없으면 첫 번째 표 fallback
      const tableEl =
        lastActiveTableElRef.current ??
        container.querySelector(".tableWrapper table");
      if (!tableEl) { setTableBounds(null); return; }
      const cRect = container.getBoundingClientRect();
      const wRect = tableEl.getBoundingClientRect();
      setTableBounds({
        top: wRect.top - cRect.top,
        left: wRect.left - cRect.left,
        right: wRect.right - cRect.left,
        bottom: wRect.bottom - cRect.top,
        width: wRect.width,
        height: wRect.height,
      });
    });
  }, []);

  // 마우스 이동 시 표 위치 갱신 — 스트립 버튼 위치 계산 기준
  // querySelectorAll 로 모든 표를 검사해 커서가 어느 표(+ 스트립 22px 여유) 위에 있는지 판별
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // 스트립 드래그 중이거나 열 너비 리사이즈 중에는 업데이트 생략 — 깜빡임 방지
    if (isDraggingRef.current || isColumnResizingRef.current) return;
    const container = editorContentRef.current;
    if (!container) return;

    // 에디터 안의 모든 <table> 을 순회해 마우스 좌표와 겹치는 표를 찾음
    // 스트립은 표 바깥쪽 22px 이내에 위치하므로 그만큼 여유를 줌
    const STRIP_PX = 22;
    const allTables = Array.from(container.querySelectorAll(".tableWrapper table"));
    let matched: Element | null = null;
    for (const t of allTables) {
      const r = t.getBoundingClientRect();
      if (
        e.clientX >= r.left &&
        e.clientX <= r.right + STRIP_PX &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom + STRIP_PX
      ) {
        matched = t;
        break;
      }
    }

    if (!matched) {
      setTableBounds(null);
      return;
    }

    lastActiveTableElRef.current = matched;
    const cRect = container.getBoundingClientRect();
    const wRect = matched.getBoundingClientRect();
    const top = Math.round(wRect.top - cRect.top);
    const left = Math.round(wRect.left - cRect.left);
    const right = Math.round(wRect.right - cRect.left);
    const bottom = Math.round(wRect.bottom - cRect.top);
    const width = Math.round(wRect.width);
    const height = Math.round(wRect.height);
    setTableBounds(prev => {
      if (prev && prev.top === top && prev.left === left && prev.right === right &&
          prev.bottom === bottom && prev.width === width && prev.height === height) return prev;
      return { top, left, right, bottom, width, height };
    });
  }, []);

  // 마우스가 에디터 영역을 벗어나면 스트립 숨김 (드래그 중에는 유지)
  const handleEditorMouseLeave = useCallback(() => {
    if (!isDraggingRef.current) setTableBounds(null);
  }, []);

  /**
   * 표 스트립 mousedown 핸들러 — 클릭·드래그 통합
   *
   * - 클릭(드래그 없음): 행/열 1개 추가
   * - 드래그: 이동 방향·거리에 따라 행/열 추가·삭제
   *   - bottom 스트립: 상하(Y축) → 행 추가·삭제
   *   - right 스트립 : 좌우(X축) → 열 추가·삭제
   * - 한 단위(40px) 이동할 때마다 1행/열씩 조작
   */
  const handleAddBtnMouseDown = useCallback(
    (edge: "right" | "bottom", e: React.MouseEvent) => {
      if (!editor) return;
      // TypeScript: 중첩 함수 클로저에서도 non-null 보장하기 위해 상수로 고정
      const ed = editor;
      e.preventDefault();
      isDraggingRef.current = true;

      // 드래그 시작 시점의 활성 표를 캡처 — 여러 표가 있을 때 올바른 표만 조작
      // null 가드 후 재선언해야 클로저 내에서 TypeScript가 non-null로 추론함
      if (!lastActiveTableElRef.current) {
        isDraggingRef.current = false;
        return;
      }
      const activeTable = lastActiveTableElRef.current as HTMLElement;

      const startX = e.clientX;
      const startY = e.clientY;
      // 열은 작은 움직임에 과민하지 않도록 행보다 큰 단위 거리를 사용
      const UNIT_PX = edge === "bottom" ? 40 : 100;
      let actualDelta = 0;
      let hasDragged = false;

      // 드래그 시작 시점의 행/열 수 (최솟값 기준 계산용)
      const initialCount =
        edge === "bottom"
          ? (activeTable.querySelectorAll("tr").length ?? 1)
          : (activeTable.querySelector("tr")?.querySelectorAll("th, td").length ?? 1);

      // ─ DOM 기반 셀 위치 헬퍼 ─────────────────────────────────────────────────
      // doc.nodeAt() 보다 ed.view.posAtDOM() 이 더 신뢰할 수 있어 DOM에서 직접 계산

      // 에디터 컨테이너 내 DOM 셀 요소 → ProseMirror 내부 위치
      function cellToPmPos(cell: Element): number | null {
        try {
          return ed.view.posAtDOM(cell, 0);
        } catch {
          return null;
        }
      }

      // 표의 마지막 행 마지막 셀 위치 (행 추가/삭제 시 커서 이동용)
      function findLastCellPos(): number | null {
        const rows = activeTable.querySelectorAll("tr");
        const lastRow = rows[rows.length - 1];
        if (!lastRow) return null;
        const cells = lastRow.querySelectorAll("th, td");
        const lastCell = cells[cells.length - 1];
        if (!lastCell) return null;
        return cellToPmPos(lastCell);
      }

      // 첫 번째 행의 마지막 셀 위치 (열 추가/삭제 시 커서 이동용)
      function findFirstRowLastCellPos(): number | null {
        const firstRow = activeTable.querySelector("tr");
        if (!firstRow) return null;
        const cells = firstRow.querySelectorAll("th, td");
        const lastCell = cells[cells.length - 1];
        if (!lastCell) return null;
        return cellToPmPos(lastCell);
      }

      // ProseMirror 커서를 pos 로 이동 (posAtDOM 결과를 그대로 사용)
      function setCursorAt(pos: number): boolean {
        try {
          const { doc } = ed.view.state;
          const sel = TextSelection.near(doc.resolve(pos));
          ed.view.dispatch(ed.view.state.tr.setSelection(sel));
          return true;
        } catch {
          return false;
        }
      }

      // ─ 내용 유무 확인 (내용 있는 행/열은 삭제 금지) ─────────────────────────

      // 마지막 행의 모든 셀이 비어 있는지 확인
      function isLastRowEmpty(): boolean {
        const rows = activeTable.querySelectorAll("tr");
        const lastRow = rows[rows.length - 1];
        if (!lastRow) return true;
        return Array.from(lastRow.querySelectorAll("th, td")).every(
          (cell) => !cell.textContent?.trim(),
        );
      }

      // 마지막 열의 모든 셀이 비어 있는지 확인
      function isLastColEmpty(): boolean {
        const rows = activeTable.querySelectorAll("tr");
        return Array.from(rows).every((row) => {
          const cells = row.querySelectorAll("th, td");
          return !cells[cells.length - 1]?.textContent?.trim();
        });
      }

      // ─ 행/열 조작 ─────────────────────────────────────────────────────────

      function addRowAtEnd() {
        const pos = findLastCellPos();
        if (pos === null || !setCursorAt(pos)) return;
        ed.commands.addRowAfter();
      }

      // 성공 여부 반환 — 내용 있으면 false (actualDelta 갱신 제어용)
      function deleteLastRow(): boolean {
        if (!isLastRowEmpty()) return false;
        const pos = findLastCellPos();
        if (pos === null || !setCursorAt(pos)) return false;
        ed.commands.deleteRow();
        return true;
      }

      function addColAtEnd() {
        // 추가 전 마지막 열 너비 기억 — 새 열에 동일 너비 적용해 테이블이 늘어나지 않도록
        const firstRow = activeTable.querySelector("tr");
        const existingCells = firstRow ? Array.from(firstRow.querySelectorAll("th, td")) : [];
        const lastCell = existingCells[existingCells.length - 1] as HTMLElement | undefined;
        // colwidth 속성 우선, 없으면 DOM offsetWidth 사용
        const prevWidth = lastCell
          ? (parseInt(lastCell.getAttribute("colwidth") ?? "", 10) || lastCell.offsetWidth || null)
          : null;

        const pos = findFirstRowLastCellPos();
        if (pos === null || !setCursorAt(pos)) return;
        ed.commands.addColumnAfter();

        // DOM 갱신 후 새 열(각 행의 마지막 셀)에 기존 열과 동일한 colwidth 설정
        if (prevWidth) {
          requestAnimationFrame(() => {
            // addColumnAfter 후 DOM이 바뀌었을 수 있으나 activeTable 레퍼런스는 동일 요소를 가리킴
            const newTable = activeTable;
            if (!newTable) return;
            const { state: latest } = ed.view;
            let pmTr = latest.tr;
            let changed = false;
            for (const row of Array.from(newTable.querySelectorAll("tr"))) {
              const rowCells = Array.from(row.querySelectorAll("th, td"));
              const newCell = rowCells[rowCells.length - 1];
              if (!newCell) continue;
              try {
                const innerPos = ed.view.posAtDOM(newCell, 0);
                const $pos = latest.doc.resolve(innerPos);
                for (let d = $pos.depth; d >= 0; d--) {
                  const n = $pos.node(d);
                  if (n.type.name === "tableCell" || n.type.name === "tableHeader") {
                    pmTr = pmTr.setNodeMarkup($pos.before(d), null, { ...n.attrs, colwidth: [prevWidth] });
                    changed = true;
                    break;
                  }
                }
              } catch { /* 위치 변환 실패 시 무시 */ }
            }
            if (changed) ed.view.dispatch(pmTr);
          });
        }
      }

      function deleteLastCol(): boolean {
        if (!isLastColEmpty()) return false;
        const pos = findFirstRowLastCellPos();
        if (pos === null || !setCursorAt(pos)) return false;
        ed.commands.deleteColumn();
        return true;
      }

      // ─ 드래그 이벤트 ──────────────────────────────────────────────────────

      function onMouseMove(ev: MouseEvent) {
        // 5px 미만 이동은 클릭으로 처리
        if (!hasDragged) {
          if (Math.abs(ev.clientX - startX) > 5 || Math.abs(ev.clientY - startY) > 5)
            hasDragged = true;
          else return;
        }

        // bottom 스트립: 상하(Y축)로 행 조작 / right 스트립: 좌우(X축)로 열 조작
        const axis = edge === "bottom" ? ev.clientY - startY : ev.clientX - startX;
        // Math.trunc: 단위 거리를 전부 이동해야 다음 단계로 전환 (Math.round보다 느긋한 반응)
        const rawDelta = Math.trunc(axis / UNIT_PX);
        const desiredCount = Math.max(1, initialCount + rawDelta);
        const currentCount = initialCount + actualDelta;
        const diff = desiredCount - currentCount;

        if (diff > 0) {
          for (let i = 0; i < diff; i++) {
            if (edge === "bottom") addRowAtEnd(); else addColAtEnd();
            actualDelta++;
          }
        } else if (diff < 0) {
          for (let i = 0; i < -diff && initialCount + actualDelta > 1; i++) {
            // 내용 있으면 삭제 중단
            const deleted = edge === "bottom" ? deleteLastRow() : deleteLastCol();
            if (!deleted) break;
            actualDelta--;
          }
        }

        setDragInfo(actualDelta !== 0 ? { edge, delta: actualDelta } : null);
      }

      function onMouseUp() {
        isDraggingRef.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";

        // 드래그 없이 클릭만 했으면 1개 추가
        if (!hasDragged) {
          if (edge === "bottom") addRowAtEnd(); else addColAtEnd();
        }
        setDragInfo(null);
        // 표 크기 변화를 스트립 위치에 반영
        updateTableBounds();
      }

      // bottom 스트립: 상하 드래그 → ns-resize / right 스트립: 좌우 드래그 → ew-resize
      document.body.style.cursor = edge === "bottom" ? "ns-resize" : "ew-resize";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [editor, updateTableBounds],
  );

  // 툴바·인라인컨트롤용 열 추가 — 커서 위치 셀 너비를 새 열에 그대로 적용해 표가 늘어나지 않게 함
  const addColumnAfterWithSameWidth = useCallback(() => {
    if (!editor) return;
    const ed = editor;

    // 커서가 있는 셀의 colwidth 파악 (없으면 DOM 실측)
    let prevWidth: number | null = null;
    const { $anchor } = ed.view.state.selection;
    for (let d = $anchor.depth; d >= 0; d--) {
      const n = $anchor.node(d);
      if (n.type.name === "tableCell" || n.type.name === "tableHeader") {
        const cw = n.attrs.colwidth as number[] | null;
        if (cw?.[0]) {
          prevWidth = cw[0];
        } else {
          try {
            const dom = ed.view.nodeDOM($anchor.before(d));
            if (dom instanceof HTMLElement) prevWidth = dom.offsetWidth || null;
          } catch { /* ignore */ }
        }
        break;
      }
    }

    ed.commands.addColumnAfter();

    if (!prevWidth) return;
    const width = prevWidth;
    requestAnimationFrame(() => {
      const table = editorContentRef.current?.querySelector("table");
      if (!table) return;
      const { state: latest } = ed.view;
      let pmTr = latest.tr;
      let changed = false;
      for (const row of Array.from(table.querySelectorAll("tr"))) {
        const cells = Array.from(row.querySelectorAll("th, td"));
        const newCell = cells[cells.length - 1];
        if (!newCell) continue;
        try {
          const innerPos = ed.view.posAtDOM(newCell, 0);
          const $pos = latest.doc.resolve(innerPos);
          for (let d = $pos.depth; d >= 0; d--) {
            const n = $pos.node(d);
            if (n.type.name === "tableCell" || n.type.name === "tableHeader") {
              pmTr = pmTr.setNodeMarkup($pos.before(d), null, { ...n.attrs, colwidth: [width] });
              changed = true;
              break;
            }
          }
        } catch { /* ignore */ }
      }
      if (changed) ed.view.dispatch(pmTr);
    });
  }, [editor]);

  // 클립보드에서 이미지를 붙여넣었을 때 업로드
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      const imageItem = Array.from(e.clipboardData.items).find(
        (item) => item.kind === "file" && item.type.startsWith("image/")
      );
      const file = imageItem?.getAsFile();
      if (!file) return;
      e.preventDefault();
      void uploadAndInsert(file);
    },
    [uploadAndInsert]
  );

  // 표 안에 커서가 있는지 반응형으로 추적 — 인라인 컨트롤 바 표시 여부 결정
  const isTableActive = useEditorState({
    editor,
    selector: ({ editor: ed }) => ed?.isActive("table") ?? false,
  });

  if (!editor) {
    return null;
  }

  return (
    <>
    {/* 에디터 내부 표 스타일 — prose 기본값을 보완해 셀 테두리·선택 하이라이트를 명시적으로 지정 */}
    <style>{`
      .ProseMirror .tableWrapper { overflow-x: auto; }
      .ProseMirror table { border-collapse: collapse; table-layout: fixed; margin: 0; }
      .ProseMirror table td, .ProseMirror table th { border: 1px solid #D9D9D9; padding: 3px 8px; vertical-align: top; min-width: 40px; position: relative; box-sizing: border-box; }
      .ProseMirror table th { background-color: #F8FAFC; font-weight: 600; }
      .ProseMirror table td > p, .ProseMirror table th > p { margin: 0; line-height: 1.5; }
      .ProseMirror .selectedCell::after { content: ''; position: absolute; inset: 0; background: rgba(37,99,235,0.08); pointer-events: none; }
      .ProseMirror .column-resize-handle { position: absolute; right: -2px; top: 0; bottom: 0; width: 4px; background: #2563EB; cursor: col-resize; z-index: 5; opacity: 0; transition: opacity 0.15s; }
      .ProseMirror td:hover .column-resize-handle, .ProseMirror th:hover .column-resize-handle, .ProseMirror .resize-cursor .column-resize-handle { opacity: 1; }
      .ProseMirror.resize-cursor { cursor: col-resize; }
    `}</style>
    <div className="w-full border border-[#D9D9D9] rounded-md overflow-hidden bg-white shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-center gap-1 bg-gray-50 p-2 border-b border-[#D9D9D9]">
        {/* fieldset[disabled] 로 소스 모드일 때 모든 WYSIWYG 툴바 버튼을 일괄 비활성화. */}
        {/* display:contents 로 layout 영향 없이 disabled 만 자식 버튼들에 전파됨. */}
        <fieldset disabled={mode !== "edit"} className="contents">
          <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          title="굵게 (Ctrl+B 또는 **텍스트**)"
        >
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          title="기울임 (Ctrl+I 또는 *텍스트*)"
        >
          <Italic className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive("strike")}
          title="취소선 (~~텍스트~~)"
        >
          <Strikethrough className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-[1px] h-4 bg-gray-300 mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive("heading", { level: 1 })}
          title="제목 1 (# 텍스트)"
        >
          <Heading1 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive("heading", { level: 2 })}
          title="제목 2 (## 텍스트)"
        >
          <Heading2 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive("heading", { level: 3 })}
          title="제목 3 (### 텍스트)"
        >
          <Heading3 className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-[1px] h-4 bg-gray-300 mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          title="기호 목록 (- 텍스트)"
        >
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          title="번호 목록 (1. 텍스트)"
        >
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive("blockquote")}
          title="인용구 (> 텍스트)"
        >
          <Quote className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          isActive={editor.isActive("codeBlock")}
          title="코드 블록 (```)"
        >
          <Code className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-[1px] h-4 bg-gray-300 mx-1" />

        <ToolbarButton
          onClick={() => {
            const previousUrl = editor.getAttributes("link").href;
            const url = window.prompt("URL을 입력하세요:", previousUrl);
            if (url === null) return;
            if (url === "") {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              return;
            }
            editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
          }}
          isActive={editor.isActive("link")}
          title="링크 삽입 ([텍스트](url))"
        >
          <LinkIcon className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => fileInputRef.current?.click()}
          title="이미지 삽입 (![대체텍스트](url))"
        >
          <ImageIcon className="w-4 h-4" />
        </ToolbarButton>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          ref={fileInputRef}
          onChange={handleImageUpload}
        />

        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="구분선 (---)"
        >
          <Minus className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-[1px] h-4 bg-gray-300 mx-1" />

        {/* 표 삽입 버튼 — 에디터 너비의 절반 크기로 기본 삽입 */}
        <ToolbarButton
          onClick={() => {
            const container = editorContentRef.current;
            // p-4 패딩(32px) 제외 후 절반을 3열로 나눠 각 열 너비 계산
            const editorInnerWidth = container ? container.offsetWidth - 32 : 480;
            const colW = Math.round(editorInnerWidth / 2 / 3);
            editor.chain().focus().insertContent({
              type: "table",
              content: [
                {
                  type: "tableRow",
                  content: [0, 1, 2].map(() => ({
                    type: "tableHeader",
                    attrs: { colspan: 1, rowspan: 1, colwidth: [colW] },
                    content: [{ type: "paragraph" }],
                  })),
                },
                ...[0, 1].map(() => ({
                  type: "tableRow",
                  content: [0, 1, 2].map(() => ({
                    type: "tableCell",
                    attrs: { colspan: 1, rowspan: 1, colwidth: [colW] },
                    content: [{ type: "paragraph" }],
                  })),
                })),
              ],
            }).run();
          }}
          isActive={editor.isActive("table")}
          title="표 삽입 (3×3, 헤더 포함)"
        >
          <Table2 className="w-4 h-4" />
        </ToolbarButton>

        {/* 표 안에 커서가 있을 때만 표시되는 조작 버튼 */}
        {editor.isActive("table") && (
          <>
            <div className="w-[1px] h-4 bg-gray-300 mx-0.5" />
            <ToolbarButton
              onClick={() => editor.chain().focus().addRowAfter().run()}
              title="아래에 행 추가"
            >
              <span className="text-[11px] font-semibold">+행</span>
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().deleteRow().run()}
              title="현재 행 삭제"
            >
              <span className="text-[11px] font-semibold">−행</span>
            </ToolbarButton>
            <ToolbarButton
              onClick={addColumnAfterWithSameWidth}
              title="오른쪽에 열 추가"
            >
              <span className="text-[11px] font-semibold">+열</span>
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().deleteColumn().run()}
              title="현재 열 삭제"
            >
              <span className="text-[11px] font-semibold">−열</span>
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().deleteTable().run()}
              title="표 전체 삭제"
            >
              <span className="text-[11px] font-semibold text-red-500">표삭제</span>
            </ToolbarButton>
          </>
        )}

        <div className="w-[1px] h-4 bg-gray-300 mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().chain().focus().undo().run()}
          title="실행 취소 (Ctrl+Z)"
        >
          <Undo className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().chain().focus().redo().run()}
          title="다시 실행 (Ctrl+Shift+Z)"
        >
          <Redo className="w-4 h-4" />
        </ToolbarButton>
        </fieldset>

        <div className="ml-auto flex gap-1">
          {/* 미리보기 토글 — 실제 홈페이지에서 보이는 그대로 렌더링 */}
          <ToolbarButton
            onClick={() => {
              if (mode === "source") {
                // 소스 → 미리보기: textarea 값을 editor에 동기화 후 미리보기
                editor.commands.setContent(internalValue, { contentType: "markdown", emitUpdate: false });
                const normalized = editor.getMarkdown();
                setInternalValue(normalized);
                onChange?.(normalized);
              }
              setMode((prev) => (prev === "preview" ? "edit" : "preview"));
            }}
            isActive={mode === "preview"}
            title={mode === "preview" ? "편집으로 돌아가기" : "미리보기 (홈페이지 렌더링)"}
          >
            <Eye className="w-4 h-4" />
          </ToolbarButton>
          {/* 소스 모드 토글 */}
          <ToolbarButton
            onClick={() => {
              if (mode === "source") {
                // 소스 → WYSIWYG
                editor.commands.setContent(internalValue, { contentType: "markdown", emitUpdate: false });
                const normalized = editor.getMarkdown();
                setInternalValue(normalized);
                onChange?.(normalized);
                setMode("edit");
              } else {
                setMode("source");
              }
            }}
            isActive={mode === "source"}
            title={mode === "source" ? "WYSIWYG 보기로 전환" : "마크다운 소스 보기로 전환"}
          >
            <FileCode className="w-4 h-4" />
          </ToolbarButton>
        </div>
      </div>

      {mode === "source" ? (
        <textarea
          className="w-full p-4 text-[#1a1a1a] min-h-[300px] font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 resize-y"
          value={internalValue}
          onChange={(e) => {
            setInternalValue(e.target.value);
            onChange?.(e.target.value);
          }}
          placeholder={placeholder || "마크다운 소스를 직접 입력하세요..."}
          spellCheck={false}
        />
      ) : (
        <div
          ref={editorContentRef}
          className="relative p-4 text-[#1a1a1a] min-h-[300px] prose max-w-none focus:outline-none focus-within:ring-2 focus-within:ring-[#2563EB]/20"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onPaste={handlePaste}
          onMouseMove={mode === "edit" ? handleMouseMove : undefined}
          onMouseLeave={mode === "edit" ? handleEditorMouseLeave : undefined}
        >
          {/* 이미지 업로드 중 오버레이 */}
          {isUploading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-b-md bg-white/80 backdrop-blur-sm">
              <span className="text-sm font-medium text-[#2563EB]">이미지 업로드 중...</span>
            </div>
          )}
          <EditorContent editor={editor} />

          {/* 표 오른쪽 스트립 — 열 추가/드래그(좌우)로 열 추가·삭제 */}
          {mode === "edit" && tableBounds && (
            <button
              type="button"
              onMouseDown={(e) => handleAddBtnMouseDown("right", e)}
              style={{
                position: "absolute",
                top: tableBounds.top,
                left: tableBounds.right,
                width: 20,
                height: tableBounds.height,
                cursor: "ew-resize",
              }}
              className={cn(
                "group z-20 flex items-center justify-center border-t border-r border-b border-[#D9D9D9] bg-[#f8fafc] transition-colors hover:border-[#2563EB]/40 hover:bg-blue-50",
                dragInfo?.edge === "right" && "border-[#2563EB]/40 bg-blue-50",
              )}
              title="클릭: 열 추가 / 좌우 드래그: 열 추가·삭제"
            >
              <span className="select-none text-[11px] font-bold leading-none text-[#bbb] transition-colors group-hover:text-[#2563EB]">
                +
              </span>
              {/* 드래그 중 증감 피드백 — 스트립 왼쪽에 표시 */}
              {dragInfo?.edge === "right" && (
                <div className="pointer-events-none absolute right-full top-1/2 mr-1.5 -translate-y-1/2 whitespace-nowrap rounded bg-[#1a1a1a] px-1.5 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                  {dragInfo.delta > 0 ? `+${dragInfo.delta}열` : `${dragInfo.delta}열`}
                </div>
              )}
            </button>
          )}

          {/* 표 아래쪽 스트립 — 행 추가/드래그(상하)로 행 추가·삭제 */}
          {mode === "edit" && tableBounds && (
            <button
              type="button"
              onMouseDown={(e) => handleAddBtnMouseDown("bottom", e)}
              style={{
                position: "absolute",
                top: tableBounds.bottom,
                left: tableBounds.left,
                width: tableBounds.width,
                height: 20,
                cursor: "ns-resize",
              }}
              className={cn(
                "group z-20 flex items-center justify-center border-l border-r border-b border-[#D9D9D9] bg-[#f8fafc] transition-colors hover:border-[#2563EB]/40 hover:bg-blue-50",
                dragInfo?.edge === "bottom" && "border-[#2563EB]/40 bg-blue-50",
              )}
              title="클릭: 행 추가 / 위아래 드래그: 행 추가·삭제"
            >
              <span className="select-none text-[11px] font-bold leading-none text-[#bbb] transition-colors group-hover:text-[#2563EB]">
                +
              </span>
              {/* 드래그 중 증감 피드백 — 스트립 위에 표시 */}
              {dragInfo?.edge === "bottom" && (
                <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-[#1a1a1a] px-1.5 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                  {dragInfo.delta > 0 ? `+${dragInfo.delta}행` : `${dragInfo.delta}행`}
                </div>
              )}
            </button>
          )}
        </div>
      )}

      {/* 표 인라인 컨트롤 바 — 표 셀에 커서가 있을 때 에디터 하단에 나타남 */}
      {mode === "edit" && isTableActive && (
        <div className="flex flex-wrap items-center gap-0.5 border-t border-[#D9D9D9] bg-gray-50 px-2 py-1.5">
          <span className="mr-0.5 text-[10px] font-semibold tracking-wide text-[#666666]">행</span>
          <BubbleBtn onClick={() => editor.chain().focus().addRowBefore().run()} title="위에 행 추가">↑ 추가</BubbleBtn>
          <BubbleBtn onClick={() => editor.chain().focus().addRowAfter().run()} title="아래에 행 추가">↓ 추가</BubbleBtn>
          <BubbleBtn onClick={() => editor.chain().focus().deleteRow().run()} title="현재 행 삭제" danger>삭제</BubbleBtn>
          <div className="mx-1 h-3.5 w-px bg-gray-300" />
          <span className="mr-0.5 text-[10px] font-semibold tracking-wide text-[#666666]">열</span>
          <BubbleBtn onClick={() => editor.chain().focus().addColumnBefore().run()} title="왼쪽에 열 추가">← 추가</BubbleBtn>
          <BubbleBtn onClick={addColumnAfterWithSameWidth} title="오른쪽에 열 추가">→ 추가</BubbleBtn>
          <BubbleBtn onClick={() => editor.chain().focus().deleteColumn().run()} title="현재 열 삭제" danger>삭제</BubbleBtn>
          <div className="mx-1 h-3.5 w-px bg-gray-300" />
          <BubbleBtn onClick={() => editor.chain().focus().deleteTable().run()} title="표 전체 삭제" danger>표 전체 삭제</BubbleBtn>
        </div>
      )}

      <input
        type="hidden"
        id={id}
        name={name}
        value={internalValue}
        required={required}
      />
    </div>

    {/* 전체화면 미리보기 오버레이 — createPortal 로 document.body 에 마운트해 z-index 충돌 방지 */}
    {mounted && mode === "preview" && createPortal(
      <div className="fixed inset-0 z-[9999] flex flex-col overflow-hidden bg-gray-50">
        {/* 상단 미리보기 바 */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#D9D9D9] bg-white px-4 py-2.5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#2563EB]" />
            <span className="text-xs font-medium text-[#666666]">
              미리보기 — 실제 홈페이지와 동일한 렌더링
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMode("edit")}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-[#1a1a1a] transition-colors hover:bg-gray-100"
          >
            ✕ 편집으로 돌아가기
          </button>
        </div>

        {/* 스크롤 가능한 본문 영역 */}
        <div className="flex-1 overflow-y-auto">
          {/* 실제 공개 페이지와 동일한 컨테이너·패딩·최대 너비 */}
          <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-20">
            {/* 제목이 전달된 경우 기사 헤더 시뮬레이션 */}
            {previewTitle && (
              <header className="mb-10 border-b border-[#D9D9D9] pb-8">
                <h1 className="text-3xl font-bold leading-tight text-[#1a1a1a] sm:text-4xl">
                  {previewTitle}
                </h1>
              </header>
            )}
            {internalValue.trim() ? (
              <MarkdownViewer body={internalValue} />
            ) : (
              <p className="text-sm text-[#666666]">내용이 없습니다.</p>
            )}
          </div>
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}

function BubbleBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "rounded px-1.5 py-0.5 font-mono text-xs transition-colors",
        danger
          ? "text-red-500 hover:bg-red-50"
          : "text-[#1a1a1a] hover:bg-gray-100",
      )}
    >
      {children}
    </button>
  );
}

function ToolbarButton({
  children,
  onClick,
  isActive,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "p-2 rounded-md transition-colors",
        isActive ? "bg-gray-200 text-[#1a1a1a]" : "text-[#666666] hover:bg-gray-100 hover:text-[#1a1a1a]",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {children}
    </button>
  );
}
