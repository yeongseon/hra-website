"use client";

import { RichTextEditor } from "./rich-text-editor";

/**
 * 마크다운 에디터 래퍼 컴포넌트
 * - 내부적으로 TipTap 기반 RichTextEditor 를 사용하지만, 입출력은 모두 마크다운 문자열입니다.
 * - 기존 호출부와의 시그니처 호환을 위해 별도 컴포넌트로 유지합니다.
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
