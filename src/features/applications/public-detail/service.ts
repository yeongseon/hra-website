/**
 * 공개 지원 양식 상세의 Application Service입니다.
 * 엄격한 UUID와 공개 정책을 검증한 뒤 브라우저 표시·제출에 필요한 DTO만 만듭니다.
 */
import "server-only";

import { z } from "zod/v4";
import { findPublicApplicationFormRow, findPublicApplicationQuestionRows } from "./repository";

type PublicApplicationQuestionType = "SHORT_ANSWER" | "LONG_ANSWER" | "MULTIPLE_CHOICE" | "CHECKBOX" | "DROPDOWN";

/** 공개 클라이언트에 전달하는 값은 DB row와 별도 계약으로 명시합니다. */
export type PublicApplicationFormDetail =
  | { kind: "invalid" }
  | { kind: "unavailable" }
  | {
      kind: "published";
      form: { id: string; title: string; description: string | null };
      questions: Array<{
        id: string;
        title: string;
        description: string | null;
        type: PublicApplicationQuestionType;
        isRequired: boolean;
        options: Array<{ id: string; value: string }>;
      }>;
    };

/** 잘못된 ID는 DB 전에 중단하고, 없거나 비공개인 양식은 같은 비가용 결과를 반환합니다. */
export async function getPublicApplicationFormDetail(id: string): Promise<PublicApplicationFormDetail> {
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return { kind: "invalid" };

  const form = await findPublicApplicationFormRow(parsedId.data);
  if (!form?.isPublished) return { kind: "unavailable" };

  const rows = await findPublicApplicationQuestionRows(parsedId.data);
  return {
    kind: "published",
    form: { id: form.id, title: form.title, description: form.description },
    questions: rows.map((question) => ({
      id: question.id,
      title: question.title,
      description: question.description,
      type: question.type,
      isRequired: question.isRequired,
      options: question.options.map((option) => ({ id: option.id, value: option.value })),
    })),
  };
}
