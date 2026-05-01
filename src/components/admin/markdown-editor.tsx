"use client";

import { RichTextEditor } from "./rich-text-editor";

/**
 * 하위 호환성을 위한 마크다운 에디터 래퍼 컴포넌트
 * 기존 마크다운 에디터를 사용하는 곳에서 코드 수정 없이 TipTap WYSIWYG 에디터를 사용할 수 있도록 합니다.
 * (내부적으로는 HTML을 생성 및 반환합니다.)
 */
interface MarkdownEditorProps {
  id?: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
}

export function MarkdownEditor({
  id,
  name,
  defaultValue = "",
  required = false,
  placeholder = "내용을 작성해주세요...",
  value,
  onChange,
}: MarkdownEditorProps) {
  return (
    <RichTextEditor
      id={id}
      name={name}
      defaultValue={defaultValue}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
    />
  );
}
