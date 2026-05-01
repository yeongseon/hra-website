"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { useCallback, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Highlighter,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Image as ImageIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Minus,
  Undo,
  Redo,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 리치 텍스트 에디터 컴포넌트
 * WYSIWYG 환경 제공 및 내부적으로 HTML 형태로 값을 반환합니다.
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Underline,
      Link.configure({ openOnClick: false }),
      Image,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: placeholder || "내용을 입력하세요..." }),
    ],
    content: value ?? defaultValue,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      setInternalValue(html);
      onChange?.(html);
    },
  });

  // 이미지 업로드 핸들러
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
      {/* 툴바 */}
      <div className="flex flex-wrap items-center gap-1 bg-gray-50 p-2 border-b border-[#D9D9D9]">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          title="굵게"
        >
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          title="기울임"
        >
          <Italic className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive("underline")}
          title="밑줄"
        >
          <UnderlineIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive("strike")}
          title="취소선"
        >
          <Strikethrough className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-[1px] h-4 bg-gray-300 mx-1" />

        <input
          type="color"
          onInput={(event) =>
            editor.chain().focus().setColor((event.target as HTMLInputElement).value).run()
          }
          value={editor.getAttributes("textStyle").color || "#000000"}
          className="w-6 h-6 p-0 border-0 cursor-pointer rounded-md bg-transparent"
          title="글자 색상"
        />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHighlight({ color: "#fef08a" }).run()}
          isActive={editor.isActive("highlight")}
          title="하이라이트"
        >
          <Highlighter className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-[1px] h-4 bg-gray-300 mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          isActive={editor.isActive({ textAlign: "left" })}
          title="왼쪽 정렬"
        >
          <AlignLeft className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          isActive={editor.isActive({ textAlign: "center" })}
          title="가운데 정렬"
        >
          <AlignCenter className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          isActive={editor.isActive({ textAlign: "right" })}
          title="오른쪽 정렬"
        >
          <AlignRight className="w-4 h-4" />
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
          title="링크 삽입"
        >
          <LinkIcon className="w-4 h-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => fileInputRef.current?.click()}
          title="이미지 삽입"
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

        <div className="w-[1px] h-4 bg-gray-300 mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive("heading", { level: 1 })}
          title="제목 1"
        >
          <Heading1 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive("heading", { level: 2 })}
          title="제목 2"
        >
          <Heading2 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive("heading", { level: 3 })}
          title="제목 3"
        >
          <Heading3 className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-[1px] h-4 bg-gray-300 mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          title="기호 목록"
        >
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          title="번호 목록"
        >
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="구분선"
        >
          <Minus className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-[1px] h-4 bg-gray-300 mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().chain().focus().undo().run()}
          title="실행 취소"
        >
          <Undo className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().chain().focus().redo().run()}
          title="다시 실행"
        >
          <Redo className="w-4 h-4" />
        </ToolbarButton>
      </div>

      {/* 에디터 본문 */}
      <div className="p-4 text-[#1a1a1a] min-h-[300px] prose max-w-none focus:outline-none focus-within:ring-2 focus-within:ring-[#2563EB]/20">
        <EditorContent editor={editor} />
      </div>

      {/* Form 전송용 hidden input */}
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
