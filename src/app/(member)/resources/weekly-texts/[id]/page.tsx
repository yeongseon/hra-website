import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { MarkdownViewer } from "@/components/markdown/markdown-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { weeklyTexts } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type WeeklyTextViewerPageProps = {
  params: Promise<{ id: string }>;
};

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

const getWeeklyText = async (id: string) => {
  const [text] = await db
    .select({
      id: weeklyTexts.id,
      title: weeklyTexts.title,
      body: weeklyTexts.body,
      textType: weeklyTexts.textType,
      createdAt: weeklyTexts.createdAt,
    })
    .from(weeklyTexts)
    .where(eq(weeklyTexts.id, id))
    .limit(1);

  return text ?? null;
};

export async function generateMetadata({ params }: WeeklyTextViewerPageProps): Promise<Metadata> {
  const { id } = await params;
  const text = await getWeeklyText(id);

  if (!text?.body) {
    return { title: "주차별 텍스트" };
  }

  return { title: text.title };
}

export default async function WeeklyTextViewerPage({ params }: WeeklyTextViewerPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const role = session.user.role;
  if (role !== "ADMIN" && role !== "FACULTY" && role !== "MEMBER") {
    redirect("/resources");
  }

  const { id } = await params;
  const text = await getWeeklyText(id);

  if (!text?.body) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-20 md:py-32">
      <div className="mb-8">
        <Link href="/resources">
          <Button variant="ghost" className="text-[#666666] hover:bg-gray-50 hover:text-[#1a1a1a]">
            <ArrowLeft className="size-4" />
            목록으로
          </Button>
        </Link>
      </div>

      <Card className="rounded-2xl border-[#D9D9D9] bg-white py-0 shadow-[var(--shadow-soft)]">
        <CardHeader className="border-b border-[#D9D9D9] py-6 sm:py-8">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#666666] sm:text-sm">
              <Badge variant="secondary" className="border border-[#D9D9D9] bg-gray-50 text-[#666666]">
                <CalendarDays className="size-3.5" />
                {formatDate(text.createdAt)}
              </Badge>
              {text.textType ? (
                <Badge variant="outline" className="border-[#D9D9D9] bg-white text-[#666666]">
                  {text.textType}
                </Badge>
              ) : null}
            </div>
            <CardTitle className="text-xl font-semibold text-[#1a1a1a] sm:text-2xl md:text-3xl">
              {text.title}
            </CardTitle>
          </div>
        </CardHeader>

        <CardContent className="py-6 sm:py-10">
          <MarkdownViewer body={text.body} />
        </CardContent>
      </Card>
    </div>
  );
}
