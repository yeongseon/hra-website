/**
 * 공개 지원 양식 상세의 PostgreSQL 조회를 소유합니다.
 * Page나 클라이언트에 내부 양식·질문·선택지 행 전체를 전달하지 않습니다.
 */
import "server-only";

import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { applicationForms, applicationQuestions, applicationQuestionOptions } from "@/lib/db/schema";

/** 공개 여부 판단에 필요한 마스터 네 필드만 읽습니다. */
export async function findPublicApplicationFormRow(id: string) {
  return db.query.applicationForms.findFirst({
    where: eq(applicationForms.id, id),
    columns: { id: true, title: true, description: true, isPublished: true },
  });
}

/** 공개 양식에서만 호출하며 기존 질문·선택지 order 오름차순을 보존합니다. */
export async function findPublicApplicationQuestionRows(formId: string) {
  return db.query.applicationQuestions.findMany({
    where: eq(applicationQuestions.formId, formId),
    columns: { id: true, title: true, description: true, type: true, isRequired: true },
    orderBy: [asc(applicationQuestions.order)],
    with: {
      options: {
        columns: { id: true, value: true },
        orderBy: [asc(applicationQuestionOptions.order)],
      },
    },
  });
}
