"use client";

import { useEditor, EditorContent, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";

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
function ImageResizeView({ node, selected, updateAttributes }: ReactNodeViewProps) {
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

  // 프리셋/드래그로 attrs.width가 확정되면 숫자 입력 필드도 동기화
  useEffect(() => {
    setCustomInput(attrs.width ? attrs.width.replace("%", "") : "");
  }, [attrs.width]);

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
      updateAttributes({ width: `${newPct}%` });
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
      {/* 크기 조정 툴바 — 선택되거나 드래그 중일 때 표시 */}
      {(selected || isDragging) && (
        <div className="absolute left-0 top-0 z-10 flex items-center gap-1 rounded-lg border border-[#D9D9D9] bg-white p-1 shadow-md">
          {SIZE_PRESETS.map(({ label, value }) => (
            <button
              key={label}
              type="button"
              onClick={() => updateAttributes({ width: value })}
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
        </div>
      )}

      {/* 이미지 컨테이너 — 너비 스타일이 이 div에 적용되고 img는 항상 w-full */}
      <div
        ref={containerRef}
        className="relative inline-block"
        style={displayWidth ? { width: displayWidth } : undefined}
      >
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

        {/* 오른쪽 가장자리 드래그 핸들 */}
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
  // 이미지 업로드 중 여부 (드래그·붙여넣기 포함)
  const [isUploading, setIsUploading] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      MarkdownImage,
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
    setInternalValue(editor.getMarkdown());
  }, [value, editor, mode]);

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

  if (!editor) {
    return null;
  }

  return (
    <>
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
          className="relative p-4 text-[#1a1a1a] min-h-[300px] prose max-w-none focus:outline-none focus-within:ring-2 focus-within:ring-[#2563EB]/20"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onPaste={handlePaste}
        >
          {/* 이미지 업로드 중 오버레이 */}
          {isUploading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-b-md bg-white/80 backdrop-blur-sm">
              <span className="text-sm font-medium text-[#2563EB]">이미지 업로드 중...</span>
            </div>
          )}
          <EditorContent editor={editor} />
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
