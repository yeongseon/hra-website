import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { PrintView } from "./_print-view";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cohorts, weeklyTexts } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function WeeklyTextPrintPage({ params }: Props) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const role = session.user.role;
  if (role !== "ADMIN" && role !== "FACULTY" && role !== "MEMBER") {
    redirect("/resources");
  }

  const { id } = await params;

  // Oracle Phase D BLOCK 수정 — z.uuid() 사전 검증으로 라우트 파라미터 leak 방지.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  const [text] = await db
    .select({
      id: weeklyTexts.id,
      title: weeklyTexts.title,
      body: weeklyTexts.body,
      createdAt: weeklyTexts.createdAt,
      cohortName: cohorts.name,
      textType: weeklyTexts.textType,
    })
    .from(weeklyTexts)
    .leftJoin(cohorts, eq(weeklyTexts.cohortId, cohorts.id))
    .where(eq(weeklyTexts.id, parsedId.data))
    .limit(1);

  if (!text || !text.body) {
    notFound();
  }

  const fileTitle = `HRA주차별텍스트_${text.title}`;

  return (
    <PrintView
      title={text.title}
      fileTitle={fileTitle}
      createdAt={text.createdAt}
      cohortName={text.cohortName}
      textType={text.textType}
      body={text.body}
    />
  );
}
