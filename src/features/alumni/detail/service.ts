/**
 * 공개 수료생 상세의 입력과 표시 데이터 경계를 적용하는 Application Service입니다.
 * Web 페이지의 엄격 UUID 정책을 유지하고 DB 행의 공개 필드만 Page에 전달합니다.
 */
import "server-only";

import { z } from "zod/v4";
import * as alumniRepository from "./repository";
import type { AlumniDetailStory, AlumniNeighbor, AlumniSidebarStory } from "./repository";

export type { AlumniDetailStory, AlumniNeighbor, AlumniSidebarStory } from "./repository";

export type PublicAlumniDetail = {
  story: AlumniDetailStory;
  prevStory: AlumniNeighbor | null;
  nextStory: AlumniNeighbor | null;
  sidebarStories: AlumniSidebarStory[];
};

// 기존 Web 상세의 RFC UUID 형식 검사를 service 입구에서도 동일하게 적용합니다.
const storyIdSchema = z.uuid();

/** 상세를 먼저 찾고 현재 순서·작성 시각으로 이웃과 사이드바를 순서대로 조회합니다. */
export async function getPublicAlumniDetail(id: string): Promise<PublicAlumniDetail | null> {
  const parsedId = storyIdSchema.safeParse(id);
  if (!parsedId.success) return null;

  const row = await alumniRepository.findAlumniStoryById(parsedId.data);
  if (!row) return null;
  const story: AlumniDetailStory = {
    id: row.id,
    name: row.name,
    title: row.title,
    quote: row.quote,
    content: row.content,
    imageUrl: row.imageUrl,
    order: row.order,
    createdAt: row.createdAt,
  };

  const previous = await alumniRepository.findPreviousAlumniStory(story.order, story.createdAt);
  const next = await alumniRepository.findNextAlumniStory(story.order, story.createdAt);
  const sidebar = await alumniRepository.listAlumniSidebarStories();

  // 저장소 구현이 바뀌어도 사이드바·이웃에 본문이나 관리 열이 섞여 나오지 않게 재투영합니다.
  return {
    story,
    prevStory: previous ? { id: previous.id, name: previous.name } : null,
    nextStory: next ? { id: next.id, name: next.name } : null,
    sidebarStories: sidebar.map((item) => ({
      id: item.id,
      name: item.name,
      title: item.title,
      summary: item.summary,
      imageUrl: item.imageUrl,
    })),
  };
}
