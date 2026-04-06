"use client";

import { useState } from "react";
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

  return (
    <div className="flex flex-col border border-slate-200 rounded-lg overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-2 min-h-[500px]">
        <div className="flex flex-col border-b md:border-b-0 md:border-r border-slate-200 bg-white">
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 flex justify-between items-center">
            <span>마크다운 작성</span>
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
                    h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mb-4" {...props} />,
                    h2: ({ node, ...props }) => <h2 className="text-xl font-semibold mb-3" {...props} />,
                    h3: ({ node, ...props }) => <h3 className="text-lg font-semibold mb-2" {...props} />,
                    p: ({ node, ...props }) => <p className="mb-4 leading-relaxed" {...props} />,
                    ul: ({ node, ...props }) => <ul className="list-disc ml-6 mb-4 space-y-1" {...props} />,
                    ol: ({ node, ...props }) => <ol className="list-decimal ml-6 mb-4 space-y-1" {...props} />,
                    li: ({ node, ...props }) => <li className="text-sm" {...props} />,
                    code: ({ node, className, children, ...props }) => {
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
                    pre: ({ node, ...props }) => (
                      <pre
                        className="block bg-slate-800 p-4 rounded-lg overflow-x-auto text-sm mb-4"
                        {...props}
                      />
                    ),
                    a: ({ node, ...props }) => (
                      <a className="text-cyan-400 underline" {...props} />
                    ),
                    blockquote: ({ node, ...props }) => (
                      <blockquote
                        className="border-l-4 border-slate-600 pl-4 italic text-slate-400 mb-4"
                        {...props}
                      />
                    ),
                    hr: ({ node, ...props }) => <hr className="border-slate-700 my-6" {...props} />,
                    strong: ({ node, ...props }) => <strong className="font-bold text-white" {...props} />,
                    em: ({ node, ...props }) => <em className="italic" {...props} />,
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
