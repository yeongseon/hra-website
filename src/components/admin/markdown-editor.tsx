"use client";

import { useState, useRef, ChangeEvent, DragEvent, ClipboardEvent } from "react";
import ReactMarkdown from "react-markdown";

interface MarkdownEditorProps {
  id?: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
}

export function MarkdownEditor({
  id,
  name,
  defaultValue = "",
  required = false,
  placeholder = "마크다운으로 내용을 작성해주세요...",
}: MarkdownEditorProps) {
  const [content, setContent] = useState(defaultValue);
  const [isUploading, setIsUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 커서 위치에 텍스트를 삽입하는 유틸리티 함수
  const insertTextAtCursor = (text: string) => {
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    // 삽입할 위치를 기준으로 텍스트 분리
    const before = content.slice(0, start);
    const after = content.slice(end);
    
    const newContent = before + text + after;
    setContent(newContent);
    
    // 상태 업데이트 후 커서 위치 조정 (setTimeout으로 렌더링 후 실행 보장)
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  };

  // 기존 텍스트를 새로운 텍스트로 치환하는 유틸리티 함수 (예: 플레이스홀더를 실제 URL로 변경)
  const replaceText = (oldText: string, newText: string) => {
    setContent((prev) => prev.replace(oldText, newText));
  };

  // 이미지 업로드 로직 (API 호출)
  const uploadImage = async (file: File) => {
    if (isUploading) return;
    
    // 이미지 파일인지 검증
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 업로드할 수 있습니다.");
      return;
    }

    // 10MB 크기 제한 검증
    if (file.size > 10 * 1024 * 1024) {
      alert("10MB 이하의 이미지만 업로드할 수 있습니다.");
      return;
    }

    try {
      setIsUploading(true);
      
      // 고유한 플레이스홀더 텍스트 생성 (업로드 중에 표시)
      const placeholderText = `![업로드 중... ${file.name}]()`;
      insertTextAtCursor(placeholderText);

      // 폼 데이터 구성 및 API 요청
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "업로드에 실패했습니다.");
      }

      // 성공 시 플레이스홀더를 실제 마크다운 이미지 문법으로 변경
      const imageMarkdown = `![${file.name}](${data.url})`;
      replaceText(placeholderText, imageMarkdown);
      
    } catch (error) {
      console.error("이미지 업로드 에러:", error);
      alert(error instanceof Error ? error.message : "이미지 업로드 중 오류가 발생했습니다.");
      
      // 실패 시 플레이스홀더 제거
      const placeholderText = `![업로드 중... ${file.name}]()`;
      replaceText(placeholderText, "");
    } finally {
      setIsUploading(false);
      // 파일 입력 초기화 (같은 파일 다시 업로드 가능하도록)
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // 파일 선택기(버튼)를 통한 업로드 처리
  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadImage(file);
    }
  };

  // 드래그 앤 드롭 영역 진입 방지 (브라우저 기본 동작 방지)
  const handleDragOver = (e: DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
  };

  // 드롭 이벤트 처리 (드래그 앤 드롭으로 파일 업로드)
  const handleDrop = (e: DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      uploadImage(file);
    }
  };

  // 붙여넣기 이벤트 처리 (클립보드의 이미지 업로드)
  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = e.clipboardData.files?.[0];
    // 클립보드에 파일이 있고, 그 파일이 이미지인 경우에만 가로채서 업로드 처리
    if (file && file.type.startsWith("image/")) {
      e.preventDefault();
      uploadImage(file);
    }
  };

  return (
    <div className="flex flex-col border border-slate-200 rounded-lg overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-2 min-h-[500px]">
        <div className="flex flex-col border-b md:border-b-0 md:border-r border-slate-200 bg-white">
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <span>마크다운 작성</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="text-xs text-slate-600 hover:text-blue-500 flex items-center gap-1 disabled:opacity-50"
              >
                <span>📷</span>
                <span>{isUploading ? "업로드 중..." : "이미지 첨부"}</span>
              </button>
              <input
                type="file"
                accept="image/jpeg, image/png, image/webp, image/gif"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileSelect}
              />
            </div>
            <a
              href="https://www.markdownguide.org/basic-syntax/"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-500 hover:underline"
            >
              문법 안내
            </a>
          </div>
          <textarea
            id={id}
            name={name}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            ref={textareaRef}
            required={required}
            placeholder={placeholder}
            className="flex-1 w-full p-4 resize-none focus:outline-none font-mono text-sm text-slate-900 bg-white"
          />
        </div>

        <div className="flex flex-col bg-slate-900 text-slate-200">
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
            미리보기
          </div>
          <div className="flex-1 p-4 overflow-y-auto">
            {content ? (
              <div className="markdown-preview break-words">
                <ReactMarkdown
                  components={{
                    h1: (props) => <h1 className="text-2xl font-bold mb-4" {...props} />,
                    h2: (props) => <h2 className="text-xl font-semibold mb-3" {...props} />,
                    h3: (props) => <h3 className="text-lg font-semibold mb-2" {...props} />,
                    p: (props) => <p className="mb-4 leading-relaxed" {...props} />,
                    ul: (props) => <ul className="list-disc ml-6 mb-4 space-y-1" {...props} />,
                    ol: (props) => <ol className="list-decimal ml-6 mb-4 space-y-1" {...props} />,
                    li: (props) => <li className="text-sm" {...props} />,
                    code: ({ className, children, ...props }) => {
                      const match = /language-(\w+)/.exec(className || "");
                      if (!match) {
                        return (
                          <code
                            className="bg-slate-800 px-1.5 py-0.5 rounded text-sm text-emerald-400"
                            {...props}
                          >
                            {children}
                          </code>
                        );
                      }
                      return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                    pre: (props) => (
                      <pre
                        className="block bg-slate-800 p-4 rounded-lg overflow-x-auto text-sm mb-4"
                        {...props}
                      />
                    ),
                    a: (props) => (
                      <a className="text-cyan-400 underline" {...props} />
                    ),
                    blockquote: (props) => (
                      <blockquote
                        className="border-l-4 border-slate-600 pl-4 italic text-slate-400 mb-4"
                        {...props}
                      />
                    ),
                    hr: (props) => <hr className="border-slate-700 my-6" {...props} />,
                    strong: (props) => <strong className="font-bold text-white" {...props} />,
                    em: (props) => <em className="italic" {...props} />,
                  }}
                >
                  {content}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                내용을 입력하면 미리보기가 표시됩니다
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
