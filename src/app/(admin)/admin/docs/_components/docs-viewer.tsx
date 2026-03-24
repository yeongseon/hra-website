"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type DocsTabItem = {
  id: string;
  label: string;
  content: string;
};

function parseInlineBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  let token = 0;

  return parts.map((part) => {
    const key = `inline-${token++}-${part}`;

    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }

    return <span key={key}>{part}</span>;
  });
}

function renderMarkdown(content: string) {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const nodes: ReactNode[] = [];

  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !(lines[index] ?? "").startsWith("```")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }

      if (index < lines.length && (lines[index] ?? "").startsWith("```")) {
        index += 1;
      }

      nodes.push(
        <pre
          key={`code-${index}-${language}`}
          className="overflow-x-auto rounded-md border border-slate-200 bg-slate-900 p-4 text-xs leading-6 text-slate-100"
        >
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    const heading3 = line.match(/^###\s+(.+)/);
    if (heading3) {
      nodes.push(
        <h3 key={`h3-${index}`} className="mt-5 text-lg font-semibold text-slate-900">
          {parseInlineBold(heading3[1])}
        </h3>
      );
      index += 1;
      continue;
    }

    const heading2 = line.match(/^##\s+(.+)/);
    if (heading2) {
      nodes.push(
        <h2 key={`h2-${index}`} className="mt-6 text-xl font-semibold text-slate-900">
          {parseInlineBold(heading2[1])}
        </h2>
      );
      index += 1;
      continue;
    }

    const heading1 = line.match(/^#\s+(.+)/);
    if (heading1) {
      nodes.push(
        <h1 key={`h1-${index}`} className="mt-8 text-2xl font-bold text-slate-900 first:mt-0">
          {parseInlineBold(heading1[1])}
        </h1>
      );
      index += 1;
      continue;
    }

    if (/^\s*-\s+/.test(line)) {
      const items: string[] = [];

      while (index < lines.length && /^\s*-\s+/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\s*-\s+/, ""));
        index += 1;
      }

      nodes.push(
        <ul key={`ul-${index}`} className="ml-5 list-disc space-y-1 text-sm leading-7 text-slate-800">
          {(() => {
            const seen = new Map<string, number>();

            return items.map((item) => {
              const count = (seen.get(item) ?? 0) + 1;
              seen.set(item, count);

              return <li key={`li-${item}-${count}`}>{parseInlineBold(item)}</li>;
            });
          })()}
        </ul>
      );
      continue;
    }

    if (line.trim() === "") {
      nodes.push(<br key={`br-${index}`} />);
      index += 1;
      continue;
    }

    const paragraphLines = [line];
    index += 1;

    while (
      index < lines.length &&
      (lines[index] ?? "").trim() !== "" &&
      !/^#{1,3}\s+/.test(lines[index] ?? "") &&
      !/^\s*-\s+/.test(lines[index] ?? "") &&
      !(lines[index] ?? "").startsWith("```")
    ) {
      paragraphLines.push(lines[index] ?? "");
      index += 1;
    }

    nodes.push(
      <p key={`p-${index}`} className="text-sm leading-7 whitespace-pre-wrap text-slate-800">
        {parseInlineBold(paragraphLines.join("\n"))}
      </p>
    );
  }

  return nodes;
}

type DocsViewerProps = {
  docs: DocsTabItem[];
};

export function DocsViewer({ docs }: DocsViewerProps) {
  if (docs.length === 0) {
    return <p className="text-sm text-slate-600">표시할 문서가 없습니다.</p>;
  }

  return (
    <Tabs defaultValue={docs[0].id} className="gap-4">
      <TabsList className="h-auto flex-wrap justify-start gap-1 bg-slate-100 p-1">
        {docs.map((doc) => (
          <TabsTrigger
            key={doc.id}
            value={doc.id}
            className="h-9 rounded-md px-3 text-sm data-active:bg-white"
          >
            {doc.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {docs.map((doc) => (
        <TabsContent key={doc.id} value={doc.id} className="outline-none">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="space-y-2">{renderMarkdown(doc.content)}</div>
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
