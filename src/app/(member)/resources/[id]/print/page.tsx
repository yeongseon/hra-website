import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
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

  const [log] = await db
    .select({
      id: classLogs.id,
      title: classLogs.title,
      content: classLogs.content,
      classDate: classLogs.classDate,
      authorName: users.name,
    })
    .from(classLogs)
    .innerJoin(users, eq(classLogs.authorId, users.id))
    .where(eq(classLogs.id, id))
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
