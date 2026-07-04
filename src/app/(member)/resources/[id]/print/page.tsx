import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { PrintView } from "./_print-view";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { classLogs, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

export default async function ClassLogPrintPage({ params }: Props) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;

  // Oracle Phase D BLOCK 수정 — z.uuid() 사전 검증으로 라우트 파라미터 leak 방지.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  const [log] = await db
    .select({
      id: classLogs.id,
      title: classLogs.title,
      content: classLogs.content,
      classDate: classLogs.classDate,
      authorName: users.name,
    })
    .from(classLogs)
    .leftJoin(users, eq(classLogs.authorId, users.id))
    .where(eq(classLogs.id, parsedId.data))
    .limit(1);

  if (!log) {
    notFound();
  }

  const formattedDate = formatDate(log.classDate).replace(/\s/g, "");
  const fileTitle = `HRA수업일지_${log.title}_${formattedDate}`;

  return (
    <PrintView
      title={log.title}
      fileTitle={fileTitle}
      classDate={log.classDate}
      authorName={log.authorName}
      body={log.content}
    />
  );
}
