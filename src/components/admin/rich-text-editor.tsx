"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import { useCallback, useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

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
}

export function RichTextEditor({
  id,
  name,
  defaultValue = "",
  value,
  onChange,
  placeholder,
  required,
}: RichTextEditorProps) {
  const [internalValue, setInternalValue] = useState(value ?? defaultValue);
  // 마크다운 소스 모드 토글 상태
  // - false: TipTap WYSIWYG 에디터 표시 (기본)
  // - true: <textarea> 로 원본 마크다운 직접 편집
  // 동기화 규칙:
  //   1) 소스 모드 진입 시: editor.getMarkdown() → internalValue (이미 onUpdate 로 최신 보장)
  //   2) WYSIWYG 복귀 시: textarea 의 internalValue → editor.setContent → editor.getMarkdown 재읽어
  //      internalValue 와 onChange 를 정규화된 값으로 갱신 (표시값=제출값 일치 보장)
  //   3) 외부 value prop sync useEffect 는 소스 모드일 때 skip (textarea 입력 충돌 방지)
  //   4) 소스 모드에서는 토글 외 모든 툴바 버튼 비활성화 (hidden editor 조작으로 인한 textarea 덮어쓰기 방지)
  const [isSourceMode, setIsSourceMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Image,
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
    if (isSourceMode) return;
    if (value === editor.getMarkdown()) return;
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
    setInternalValue(editor.getMarkdown());
  }, [value, editor, isSourceMode]);

  const handleImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !editor) return;

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload-image", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (data.url) {
          editor.chain().focus().setImage({ src: data.url }).run();
        }
      } catch (error) {
        console.error("이미지 업로드 실패:", error);
        alert("이미지 업로드에 실패했습니다.");
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [editor]
  );

  if (!editor) {
    return null;
  }

  return (
    <div className="w-full border border-[#D9D9D9] rounded-md overflow-hidden bg-white shadow-[var(--shadow-soft)]">
      <div className="flex flex-wrap items-center gap-1 bg-gray-50 p-2 border-b border-[#D9D9D9]">
        {/* fieldset[disabled] 로 소스 모드일 때 모든 WYSIWYG 툴바 버튼을 일괄 비활성화. */}
        {/* display:contents 로 layout 영향 없이 disabled 만 자식 버튼들에 전파됨. */}
        <fieldset disabled={isSourceMode} className="contents">
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

        <div className="ml-auto">
          <ToolbarButton
            onClick={() => {
              if (isSourceMode) {
                // 소스 → WYSIWYG: textarea 의 raw 마크다운을 editor 로 푸시한 뒤,
                // editor 가 정규화한 결과를 다시 internalValue/onChange 로 반영해
                // 표시값과 제출값이 어긋나지 않게 한다.
                editor.commands.setContent(internalValue, {
                  contentType: "markdown",
                  emitUpdate: false,
                });
                const normalized = editor.getMarkdown();
                setInternalValue(normalized);
                onChange?.(normalized);
              }
              setIsSourceMode((prev) => !prev);
            }}
            isActive={isSourceMode}
            title={isSourceMode ? "WYSIWYG 보기로 전환" : "마크다운 소스 보기로 전환"}
          >
            <FileCode className="w-4 h-4" />
          </ToolbarButton>
        </div>
      </div>

      {isSourceMode ? (
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
        <div className="p-4 text-[#1a1a1a] min-h-[300px] prose max-w-none focus:outline-none focus-within:ring-2 focus-within:ring-[#2563EB]/20">
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
