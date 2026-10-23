/**
 * 메인 수료생 carousel에 표시할 공개 필드만 전달하는 Application Service입니다.
 * 전체 본문·조회수·featured 상태는 서버 화면 경계로 넘기지 않습니다.
 */
import "server-only";

import { listFeaturedAlumniRows, type FeaturedAlumniRow } from "./repository";

export type FeaturedAlumni = FeaturedAlumniRow;

/** 저장소 행을 다섯 표시 필드로 재투영합니다. */
export async function listFeaturedAlumni(): Promise<FeaturedAlumni[]> {
  const rows = await listFeaturedAlumniRows();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    title: row.title,
    quote: row.quote,
    imageUrl: row.imageUrl,
  }));
}
