import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NoticeForm } from "@/app/(admin)/admin/notices/_components/notice-form";
import { updateNotice } from "@/features/notices/actions";
import { requireAdmin } from "@/lib/admin";
import { getFile } from "@/lib/github";

type NoticeEditPageProps = {
  params: Promise<{ slug: string }>;
};

type ParsedNotice = {
  title: string;
  status: "DRAFT" | "PUBLISHED";
  pinned: boolean;
  content: string;
};

const stripQuotes = (value: string): string => {
  const hasDoubleQuotes = value.startsWith('"') && value.endsWith('"');
  const hasSingleQuotes = value.startsWith("'") && value.endsWith("'");

  if (hasDoubleQuotes || hasSingleQuotes) {
    return value.slice(1, -1).trim();
  }

  return value;
};

const parseFrontmatter = (frontmatterText: string): Record<string, string> => {
  const map: Record<string, string> = {};

  for (const line of frontmatterText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const delimiterIndex = trimmed.indexOf(":");
    if (delimiterIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, delimiterIndex).trim();
    const rawValue = trimmed.slice(delimiterIndex + 1).trim();
    if (!key) {
      continue;
    }

    map[key] = stripQuotes(rawValue);
  }

  return map;
};

const parseNoticeMarkdown = (markdown: string): ParsedNotice | null => {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  if (lines[0] !== "---") {
    return null;
  }

  const closingDelimiterIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (closingDelimiterIndex === -1) {
    return null;
  }

  const frontmatter = parseFrontmatter(lines.slice(1, closingDelimiterIndex).join("\n"));
  const status = frontmatter.status === "DRAFT" || frontmatter.status === "PUBLISHED" ? frontmatter.status : null;
  const title = frontmatter.title?.trim();

  if (!title || !status) {
    return null;
  }

  return {
    title,
    status,
    pinned: frontmatter.pinned?.toLowerCase() === "true",
    content: lines.slice(closingDelimiterIndex + 1).join("\n").trimStart(),
  };
};

export default async function NoticeEditPage({ params }: NoticeEditPageProps) {
  await requireAdmin();
  const { slug } = await params;

  const file = await getFile(`content/notices/${slug}.md`);
  const notice = file ? parseNoticeMarkdown(file.content) : null;

  if (!notice) {
    return (
      <section className="mx-auto max-w-4xl px-6 py-10">
        <Card className="border-slate-200 bg-white">
          <CardContent className="py-10 text-center text-slate-600">공지사항을 찾을 수 없습니다.</CardContent>
        </Card>
      </section>
    );
  }

  const action = updateNotice.bind(null, slug);

  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">공지 수정</h1>
        <Button variant="outline" render={<Link href="/admin/notices" />}>
          목록으로
        </Button>
      </div>
      <NoticeForm
        action={action}
        defaultValues={{
          title: notice.title,
          content: notice.content,
          status: notice.status,
          pinned: notice.pinned,
        }}
        submitLabel="수정 저장"
        successMessage="공지사항이 수정되었습니다."
      />
    </section>
  );
}
