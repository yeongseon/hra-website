import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
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
    .where(eq(weeklyTexts.id, id))
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
