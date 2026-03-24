/**
 * ==========================================
 * 갤러리 관리 서버 액션 (Gallery Actions)
 * ==========================================
 * 
 * 이 파일은 앨범(Gallery)과 이미지를 관리하는 모든 서버 액션을 담당합니다.
 * 사용자가 앨범을 만들고, 수정하고, 삭제하거나 이미지를 추가/삭제할 때
 * 이 파일의 함수들이 실행됩니다.
 * 
 * 주요 역할:
 * 1. 관리자 권한 확인 (requireAdmin)
 * 2. 입력값 검증 (Zod 스키마 사용)
 * 3. 데이터베이스에 데이터 저장/수정/삭제
 * 4. 화면 갱신 (revalidatePath)
 * 5. 성공/실패 메시지 반환
 */

"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { galleries, galleryImages } from "@/lib/db/schema";

/**
 * 서버 액션의 반환값 타입
 * - success: 작업 성공 여부 (true/false)
 * - message: 사용자에게 보여줄 메시지 (성공/실패 안내 문구)
 */
export type GalleryActionState = {
  success: boolean;
  message: string;
};

/**
 * 앨범 생성/수정 시 필수 정보를 검증하는 규칙 (Zod 스키마)
 * 
 * 입력값:
 * - title: 앨범 제목 (필수, 1~300자)
 * - description: 앨범 설명 (선택사항, 최대 5000자)
 * - coverImageUrl: 앨범 표지 이미지 URL (선택사항, 유효한 URL 형식)
 * 
 * 이 스키마를 사용하면 사용자가 잘못된 값을 입력했을 때 자동으로 감지합니다.
 */
const gallerySchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(300, "제목은 300자 이하여야 합니다."),
  description: z.string().trim().max(5000, "설명은 5000자 이하여야 합니다.").optional(),
  coverImageUrl: z.url("올바른 이미지 URL을 입력해주세요.").optional(),
});

/**
 * 앨범 수정 시 필수 정보를 검증하는 규칙
 * 
 * gallerySchema의 모든 규칙을 포함하고, 추가로:
 * - id: 수정할 앨범의 고유 ID (필수, UUID 형식)
 */
const updateGallerySchema = gallerySchema.extend({
  id: z.uuid("유효하지 않은 앨범 ID입니다."),
});

/**
 * 이미지 추가 시 필수 정보를 검증하는 규칙
 * 
 * 입력값:
 * - galleryId: 이미지를 추가할 앨범의 ID (필수, UUID 형식)
 * - url: 이미지 파일의 웹 주소 (필수, 유효한 URL 형식)
 * - alt: 이미지 설명 (선택사항, 웹 접근성 위해 사용, 최대 255자)
 * - order: 이미지 정렬 순서 (필수, 0 이상의 정수)
 */
const imageSchema = z.object({
  galleryId: z.uuid("유효하지 않은 앨범 ID입니다."),
  url: z.url("올바른 이미지 URL을 입력해주세요."),
  alt: z.string().trim().max(255, "대체 텍스트는 255자 이하여야 합니다.").optional(),
  order: z.number().int().min(0, "정렬 순서는 0 이상이어야 합니다."),
});

/**
 * 이미지 삭제 시 필수 정보를 검증하는 규칙
 * 
 * 입력값:
 * - id: 삭제할 이미지의 고유 ID (필수, UUID 형식)
 */
const imageDeleteSchema = z.object({
  id: z.uuid("유효하지 않은 이미지 ID입니다."),
});

/**
 * 헬퍼 함수 모음
 * 이 함수들은 FormData에서 값을 추출할 때 자동으로 정리해주는 역할을 합니다.
 */

/**
 * 입력 문자열을 정리해주는 함수
 * 사용 사례:
 * - FormData에서 받은 문자열의 앞뒤 공백 제거
 * - 유효하지 않은 타입이면 빈 문자열 반환
 * 
 * @param value - FormData에서 받은 값
 * @returns 정리된 문자열 또는 빈 문자열
 */
const normalizeText = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

/**
 * 선택사항인 입력 문자열을 정리해주는 함수
 * 사용 사례:
 * - 앨범 설명처럼 선택사항인 필드를 처리할 때
 * - 빈 값이면 undefined로 반환 (데이터베이스에 저장할 때 null 처리)
 * 
 * @param value - FormData에서 받은 값
 * @returns 정리된 문자열 또는 undefined (값이 비어있으면)
 */
const normalizeOptionalText = (value: FormDataEntryValue | null) => {
  const text = normalizeText(value);
  return text.length > 0 ? text : undefined;
};

/**
 * 이미지 정렬 순서 숫자를 정리해주는 함수
 * 사용 사례:
 * - FormData에서 받은 순서 번호를 검증된 정수로 변환
 * - 잘못된 형식이면 -1 반환 (검증 실패 시그널)
 * 
 * @param value - FormData에서 받은 값
 * @returns 유효한 정수 또는 -1 (변환 실패 시)
 */
const normalizeOrder = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") {
    return 0;
  }

  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isNaN(parsed) ? -1 : parsed;
};

/**
 * 성공 상태 객체를 만드는 헬퍼 함수
 * 사용 사례: 작업이 완료되었을 때 프론트엔드에 알려주기
 */
const successState = (message: string): GalleryActionState => ({ success: true, message });

/**
 * 실패 상태 객체를 만드는 헬퍼 함수
 * 사용 사례: 작업 중 오류가 발생했을 때 프론트엔드에 에러 메시지 전달
 */
const errorState = (message: string): GalleryActionState => ({ success: false, message });

/**
 * ==========================================
 * createGallery - 새 앨범 생성
 * ==========================================
 * 
 * 관리자가 새로운 갤러리 앨범을 만들 때 호출되는 서버 액션입니다.
 * 
 * 처리 순서:
 * 1. 관리자 권한 확인
 * 2. FormData에서 제목, 설명, 표지 이미지 URL 추출
 * 3. Zod로 입력값 검증 (형식 확인)
 * 4. 데이터베이스에 새 앨범 저장
 * 5. 화면 갱신하기 (관리 페이지 새로고침)
 * 6. 성공/실패 메시지 반환
 * 
 * @param formData - 사용자가 제출한 폼 데이터 (제목, 설명, 표지 이미지 등)
 * @returns 성공/실패 상태와 메시지
 */
export async function createGallery(formData: FormData): Promise<GalleryActionState> {
  // 1단계: 관리자 권한 확인 (권한이 없으면 여기서 에러 발생)
  await requireAdmin();

  // 2단계: FormData에서 값을 추출하고 정리하기
  const parsed = gallerySchema.safeParse({
    title: normalizeText(formData.get("title")),
    description: normalizeOptionalText(formData.get("description")),
    coverImageUrl: normalizeOptionalText(formData.get("coverImageUrl")),
  });

  // 3단계: 검증 실패 시 에러 메시지 반환
  if (!parsed.success) {
    return errorState(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.");
  }

  // 4단계: 데이터베이스에 새 앨범 저장
  await db.insert(galleries).values({
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    coverImageUrl: parsed.data.coverImageUrl ?? null,
  });

  // 5단계: 관리 페이지 화면 갱신 (캐시 무효화)
  revalidatePath("/admin/gallery");

  // 6단계: 성공 메시지 반환
  return successState("앨범이 생성되었습니다.");
}

/**
 * ==========================================
 * updateGallery - 기존 앨범 정보 수정
 * ==========================================
 * 
 * 관리자가 기존 앨범의 제목, 설명, 표지 이미지를 수정할 때 호출됩니다.
 * 
 * 처리 순서:
 * 1. 관리자 권한 확인
 * 2. FormData에서 앨범 ID와 수정할 정보 추출
 * 3. Zod로 입력값 검증
 * 4. 수정할 앨범이 실제로 존재하는지 확인
 * 5. 데이터베이스에서 앨범 정보 업데이트
 * 6. 화면 갱신하기
 * 7. 성공/실패 메시지 반환
 * 
 * @param id - 수정할 앨범의 고유 ID
 * @param formData - 수정할 정보 (제목, 설명, 표지 이미지 등)
 * @returns 성공/실패 상태와 메시지
 */
export async function updateGallery(id: string, formData: FormData): Promise<GalleryActionState> {
  // 1단계: 관리자 권한 확인
  await requireAdmin();

  // 2단계: 입력값 정리 및 검증
  const parsed = updateGallerySchema.safeParse({
    id,
    title: normalizeText(formData.get("title")),
    description: normalizeOptionalText(formData.get("description")),
    coverImageUrl: normalizeOptionalText(formData.get("coverImageUrl")),
  });

  // 3단계: 검증 실패 시 에러 메시지 반환
  if (!parsed.success) {
    return errorState(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.");
  }

  // 4단계: 수정할 앨범이 존재하는지 데이터베이스에서 확인
  const [existingGallery] = await db
    .select({ id: galleries.id })
    .from(galleries)
    .where(eq(galleries.id, parsed.data.id))
    .limit(1);

  // 5단계: 앨범이 없으면 에러 메시지 반환
  if (!existingGallery) {
    return errorState("앨범을 찾을 수 없습니다.");
  }

  // 6단계: 데이터베이스에서 앨범 정보 업데이트
  await db
    .update(galleries)
    .set({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      coverImageUrl: parsed.data.coverImageUrl ?? null,
      updatedAt: new Date(), // 수정 시간 자동 기록
    })
    .where(eq(galleries.id, parsed.data.id));

  // 7단계: 화면 갱신하기
  revalidatePath("/admin/gallery");

  // 8단계: 성공 메시지 반환
  return successState("앨범 정보가 수정되었습니다.");
}

/**
 * ==========================================
 * deleteGallery - 앨범 삭제
 * ==========================================
 * 
 * 관리자가 앨범을 완전히 삭제할 때 호출됩니다.
 * 
 * 처리 순서:
 * 1. 관리자 권한 확인
 * 2. 앨범 ID 형식 검증 (UUID 형식인지 확인)
 * 3. 데이터베이스에서 해당 앨범 삭제
 * 4. 화면 갱신하기
 * 5. 성공/실패 메시지 반환
 * 
 * @param id - 삭제할 앨범의 고유 ID
 * @returns 성공/실패 상태와 메시지
 */
export async function deleteGallery(id: string): Promise<GalleryActionState> {
  // 1단계: 관리자 권한 확인
  await requireAdmin();

  // 2단계: 앨범 ID가 올바른 형식(UUID)인지 검증
  const parsed = z.uuid("유효하지 않은 앨범 ID입니다.").safeParse(id);

  // 3단계: 형식이 잘못되면 에러 메시지 반환
  if (!parsed.success) {
    return errorState(parsed.error.issues[0]?.message ?? "잘못된 요청입니다.");
  }

  // 4단계: 데이터베이스에서 앨범 삭제
  await db.delete(galleries).where(eq(galleries.id, parsed.data));

  // 5단계: 화면 갱신하기
  revalidatePath("/admin/gallery");

  // 6단계: 성공 메시지 반환
  return successState("앨범이 삭제되었습니다.");
}

/**
 * ==========================================
 * addGalleryImage - 앨범에 이미지 추가
 * ==========================================
 * 
 * 관리자가 기존 앨범에 새로운 이미지를 추가할 때 호출됩니다.
 * 
 * 처리 순서:
 * 1. 관리자 권한 확인
 * 2. FormData에서 앨범 ID, 이미지 URL, 설명, 순서 추출
 * 3. Zod로 입력값 검증
 * 4. 이미지를 추가할 앨범이 실제로 존재하는지 확인
 * 5. 데이터베이스에 새 이미지 레코드 저장
 * 6. 화면 갱신하기
 * 7. 성공/실패 메시지 반환
 * 
 * @param formData - 사용자가 제출한 폼 데이터 (앨범 ID, 이미지 URL, 대체 텍스트, 순서)
 * @returns 성공/실패 상태와 메시지
 */
export async function addGalleryImage(formData: FormData): Promise<GalleryActionState> {
  // 1단계: 관리자 권한 확인
  await requireAdmin();

  // 2단계: FormData에서 값을 추출하고 정리하기
  const parsed = imageSchema.safeParse({
    galleryId: normalizeText(formData.get("galleryId")),
    url: normalizeText(formData.get("url")),
    alt: normalizeOptionalText(formData.get("alt")),
    order: normalizeOrder(formData.get("order")),
  });

  // 3단계: 검증 실패 시 에러 메시지 반환
  if (!parsed.success) {
    return errorState(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.");
  }

  // 4단계: 이미지를 추가할 앨범이 존재하는지 확인
  const [existingGallery] = await db
    .select({ id: galleries.id })
    .from(galleries)
    .where(eq(galleries.id, parsed.data.galleryId))
    .limit(1);

  // 5단계: 앨범이 없으면 에러 메시지 반환
  if (!existingGallery) {
    return errorState("앨범을 찾을 수 없습니다.");
  }

  // 6단계: 데이터베이스에 새 이미지 저장
  await db.insert(galleryImages).values({
    galleryId: parsed.data.galleryId,
    url: parsed.data.url,
    alt: parsed.data.alt ?? null,
    order: parsed.data.order,
  });

  // 7단계: 화면 갱신하기 (두 곳 모두 새로고침)
  revalidatePath("/admin/gallery");
  revalidatePath(`/admin/gallery/${parsed.data.galleryId}/edit`);

  // 8단계: 성공 메시지 반환
  return successState("이미지가 추가되었습니다.");
}

/**
 * ==========================================
 * deleteGalleryImage - 앨범에서 이미지 삭제
 * ==========================================
 * 
 * 관리자가 앨범에서 특정 이미지를 삭제할 때 호출됩니다.
 * 
 * 처리 순서:
 * 1. 관리자 권한 확인
 * 2. 이미지 ID 형식 검증
 * 3. 삭제할 이미지가 실제로 존재하는지 확인 및 속한 앨범 ID 확인
 * 4. 이미지가 없으면 에러 메시지 반환
 * 5. 데이터베이스에서 이미지 삭제
 * 6. 화면 갱신하기
 * 7. 성공/실패 메시지 반환
 * 
 * @param id - 삭제할 이미지의 고유 ID
 * @returns 성공/실패 상태와 메시지
 */
export async function deleteGalleryImage(id: string): Promise<GalleryActionState> {
  // 1단계: 관리자 권한 확인
  await requireAdmin();

  // 2단계: 이미지 ID 형식 검증
  const parsed = imageDeleteSchema.safeParse({ id });

  // 3단계: 형식이 잘못되면 에러 메시지 반환
  if (!parsed.success) {
    return errorState(parsed.error.issues[0]?.message ?? "잘못된 요청입니다.");
  }

  // 4단계: 삭제할 이미지가 존재하는지 확인하고 속한 앨범 ID 가져오기
  const [existingImage] = await db
    .select({ id: galleryImages.id, galleryId: galleryImages.galleryId })
    .from(galleryImages)
    .where(eq(galleryImages.id, parsed.data.id))
    .limit(1);

  // 5단계: 이미지가 없으면 에러 메시지 반환
  if (!existingImage) {
    return errorState("이미지를 찾을 수 없습니다.");
  }

  // 6단계: 데이터베이스에서 이미지 삭제
  // and()를 사용해 이미지 ID와 앨범 ID 두 조건을 모두 확인
  await db
    .delete(galleryImages)
    .where(and(eq(galleryImages.id, parsed.data.id), eq(galleryImages.galleryId, existingImage.galleryId)));

  // 7단계: 화면 갱신하기 (두 곳 모두 새로고침)
  revalidatePath("/admin/gallery");
  revalidatePath(`/admin/gallery/${existingImage.galleryId}/edit`);

  // 8단계: 성공 메시지 반환
  return successState("이미지가 삭제되었습니다.");
}
