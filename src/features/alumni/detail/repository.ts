/**
 * 공개 수료생 상세·이웃·사이드바의 PostgreSQL 조회를 소유합니다.
 * 표시용 열만 투영하고 현재 상세 화면의 엄격한 순서·작성 시각 비교를 유지합니다.
 */
import "server-only";

import { and, asc, desc, eq, gt, lt, or } from "drizzle-orm";
import { alumniStorySummary } from "@/features/alumni/summary";
import { db } from "@/lib/db";
import { alumniStories } from "@/lib/db/schema";

export type AlumniDetailStory = {
  id: string;
  name: string;
  title: string | null;
  quote: string;
  content: string;
  imageUrl: string | null;
  order: number;
  createdAt: Date;
};

export type AlumniNeighbor = { id: string; name: string };
export type AlumniSidebarStory = {
  id: string;
  name: string;
  title: string | null;
  summary: string;
  imageUrl: string | null;
};

/** 상세 본문에 필요한 열만 조회하고 내부 고정·조회수·관리 필드는 제외합니다. */
export async function findAlumniStoryById(id: string): Promise<AlumniDetailStory | null> {
  const story = await db.query.alumniStories.findFirst({
    where: eq(alumniStories.id, id),
    columns: {
      id: true,
      name: true,
      title: true,
      quote: true,
      content: true,
      imageUrl: true,
      order: true,
      createdAt: true,
    },
  });
  if (!story) return null;
  return {
    id: story.id,
    name: story.name,
    title: story.title,
    quote: story.quote,
    content: story.content,
    imageUrl: story.imageUrl,
    order: story.order,
    createdAt: story.createdAt,
  };
}

/** 현재 tuple보다 엄격히 앞선 이야기 중 가장 가까운 한 건을 조회합니다. */
export async function findPreviousAlumniStory(order: number, createdAt: Date): Promise<AlumniNeighbor | null> {
  const [story] = await db
    .select({ id: alumniStories.id, name: alumniStories.name })
    .from(alumniStories)
    .where(or(
      lt(alumniStories.order, order),
      and(eq(alumniStories.order, order), lt(alumniStories.createdAt, createdAt)),
    ))
    .orderBy(desc(alumniStories.order), desc(alumniStories.createdAt))
    .limit(1);
  return story ? { id: story.id, name: story.name } : null;
}

/** 현재 tuple보다 엄격히 뒤에 오는 이야기 중 가장 가까운 한 건을 조회합니다. */
export async function findNextAlumniStory(order: number, createdAt: Date): Promise<AlumniNeighbor | null> {
  const [story] = await db
    .select({ id: alumniStories.id, name: alumniStories.name })
    .from(alumniStories)
    .where(or(
      gt(alumniStories.order, order),
      and(eq(alumniStories.order, order), gt(alumniStories.createdAt, createdAt)),
    ))
    .orderBy(asc(alumniStories.order), asc(alumniStories.createdAt))
    .limit(1);
  return story ? { id: story.id, name: story.name } : null;
}

/** 사이드바용 평문 180자 요약만 DB에서 만들고 전체 본문은 전달하지 않습니다. */
export async function listAlumniSidebarStories(): Promise<AlumniSidebarStory[]> {
  const stories = await db
    .select({
      id: alumniStories.id,
      name: alumniStories.name,
      title: alumniStories.title,
      summary: alumniStorySummary,
      imageUrl: alumniStories.imageUrl,
    })
    .from(alumniStories)
    .orderBy(asc(alumniStories.order));
  return stories.map((story) => ({
    id: story.id,
    name: story.name,
    title: story.title,
    summary: story.summary,
    imageUrl: story.imageUrl,
  }));
}
