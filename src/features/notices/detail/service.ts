/**
 * 공지 상세의 공개 여부와 입력 경계를 적용하는 Application Service입니다.
 * Web 페이지와 API가 같은 읽기 정책을 사용하고, 응답 후 조회수 갱신은 별도 호출합니다.
 */
import "server-only";

import { apiV1UuidSchema } from "@hra/contracts/api-v1";
import * as noticeRepository from "./repository";
import type { NoticeLink, PublicNotice } from "./repository";

export type { NoticeLink, PublicNotice } from "./repository";

export type PublishedNoticeDetail = {
  notice: PublicNotice;
  prevNotice: NoticeLink | null;
  nextNotice: NoticeLink | null;
};

/** API와 Web의 ID 형식을 DB 접근 전에 확인하고 게시된 공지만 반환합니다. */
export async function getPublishedNoticeById(id: string): Promise<PublicNotice | null> {
  if (!apiV1UuidSchema.safeParse(id).success) return null;
  const notice = await noticeRepository.findPublishedNoticeById(id);
  if (!notice) return null;

  // 저장소 구현이 바뀌어도 작성자·초안 상태 등의 내부 열을 service 밖으로 전달하지 않습니다.
  return {
    id: notice.id,
    title: notice.title,
    content: notice.content,
    viewCount: notice.viewCount,
    createdAt: notice.createdAt,
  };
}

/** 현재 공지를 먼저 확인하고 기존 작성 시각 기준의 이전·다음글을 조회합니다. */
export async function getPublishedNoticeDetail(id: string): Promise<PublishedNoticeDetail | null> {
  const notice = await getPublishedNoticeById(id);
  if (!notice) return null;

  const prevNotice = await noticeRepository.findPreviousPublishedNotice(notice.createdAt);
  const nextNotice = await noticeRepository.findNextPublishedNotice(notice.createdAt);
  return {
    notice,
    prevNotice: prevNotice ? { id: prevNotice.id, title: prevNotice.title } : null,
    nextNotice: nextNotice ? { id: nextNotice.id, title: nextNotice.title } : null,
  };
}

/** 이미 조회한 공지의 조회수를 기존 ID 조건의 단일 UPDATE로 1 증가시킵니다. */
export async function incrementPublishedNoticeViewCount(id: string): Promise<void> {
  if (!apiV1UuidSchema.safeParse(id).success) return;
  await noticeRepository.incrementNoticeViewCount(id);
}
