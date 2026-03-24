/**
 * ========================================
 * 공지사항 관리 서버 액션 (Server Actions)
 * ========================================
 * 
 * 이 파일은 공지사항의 CRUD(Create, Read, Update, Delete) 작업을 담당합니다.
 * - Create(생성): 새로운 공지사항을 데이터베이스에 저장
 * - Read(조회): 공지사항 데이터를 불러옴
 * - Update(수정): 기존 공지사항을 수정
 * - Delete(삭제): 공지사항을 삭제
 * 
 * 서버 액션(Server Action)이란?
 * - 서버에서만 실행되는 함수들입니다
 * - 클라이언트(사용자 브라우저)에서 버튼 클릭 같은 이벤트가 발생하면
 *   이 파일의 함수들을 호출해서 데이터를 저장하거나 수정합니다
 * - "use server" 주석으로 시작하면 Next.js가 자동으로 인식합니다
 */
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { notices } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/admin";

/**
 * 공지사항 폼 데이터 검증 스키마
 * 
 * Zod란? 입력받은 데이터가 올바른 형식인지 자동으로 검사해주는 도구입니다.
 * - title: 1글자 이상 300글자 이하의 문자열
 * - content: 1글자 이상의 문자열
 * - status: "DRAFT"(임시저장) 또는 "PUBLISHED"(공개)만 허용
 * - pinned: true 또는 false (상단 고정 여부)
 */
const noticeFormSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(300),
  content: z.string().trim().min(1, "내용을 입력해주세요."),
  status: z.enum(["DRAFT", "PUBLISHED"]),
  pinned: z.boolean(),
});

/**
 * 공지사항 ID 검증 스키마
 * UUID란? 컴퓨터가 자동으로 생성하는 고유 번호로, 모든 공지사항을 구별하기 위해 사용됩니다.
 */
const noticeIdSchema = z.uuid();

/**
 * 서버 액션의 반환 타입
 * 
 * 모든 함수가 반환하는 결과물의 형태를 정의합니다.
 * - success: true/false로 작업이 성공했는지 알림
 * - error?: 실패 시 사용자에게 보여줄 오류 메시지 (선택사항)
 */
type NoticeActionState = {
  success: boolean;
  error?: string;
};

/**
 * parsePinned 헬퍼 함수
 * 
 * 폼 데이터에서 받은 값을 boolean(참/거짓)으로 변환합니다.
 * HTML 체크박스는 선택되면 "on" 또는 "true"라는 텍스트를 보내므로,
 * 이를 true/false로 바꿔줍니다.
 * 
 * 예시:
 * - value가 "on" → true (체크됨)
 * - value가 "true" → true (체크됨)
 * - value가 null이거나 다른 값 → false (체크 안 됨)
 */
const parsePinned = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") {
    return false;
  }

  return value === "on" || value === "true";
};

/**
 * revalidateNoticePaths 헬퍼 함수
 * 
 * 데이터가 변경되면 페이지의 캐시를 갱신합니다.
 * 
 * 캐시란? 한 번 읽은 데이터를 임시로 저장해놨다가 다시 요청하면
 * 빠르게 전달하는 것입니다. 하지만 데이터가 변경되면 캐시도
 * 새로 갱신해야 최신 정보가 사용자에게 보여집니다.
 * 
 * 이 함수는:
 * - /admin/notices: 관리자 페이지의 캐시 갱신
 * - /notices: 일반 사용자 공지사항 페이지의 캐시 갱신
 */
const revalidateNoticePaths = () => {
  revalidatePath("/admin/notices");
  revalidatePath("/notices");
};

/**
 * createNotice: 새로운 공지사항 생성
 * 
 * 역할: 사용자가 제출한 폼 데이터를 받아 새로운 공지사항을 데이터베이스에 저장합니다.
 * 
 * 과정:
 * 1. 관리자 권한 확인 - 일반 사용자는 접근 불가
 * 2. 입력값 검증 - 제목과 내용이 비어있지 않은지 확인
 * 3. DB 저장 - 검증된 데이터를 데이터베이스에 저장
 * 4. 캐시 갱신 - 공지사항 페이지가 새 데이터를 보여주도록 갱신
 * 5. 결과 반환 - 성공 또는 오류 메시지 반환
 */
export async function createNotice(formData: FormData): Promise<NoticeActionState> {
  // 1️⃣ 관리자 권한 확인: 관리자가 아니면 에러 발생
  const session = await requireAdmin();

  // 2️⃣ 입력값 검증: 폼에서 받은 데이터가 규칙에 맞는지 확인
  const parsed = noticeFormSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
    status: formData.get("status"),
    pinned: parsePinned(formData.get("pinned")),
  });

  // 검증 실패 시 오류 메시지 반환
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    };
  }

  try {
    // 3️⃣ DB 조작: 검증된 데이터를 데이터베이스의 notices 테이블에 새로운 행으로 추가
    await db.insert(notices).values({
      title: parsed.data.title,
      content: parsed.data.content,
      status: parsed.data.status,
      pinned: parsed.data.pinned,
      authorId: session.user.id, // 현재 관리자의 ID를 저자로 기록
    });

    // 4️⃣ 캐시 갱신: 공지사항 페이지들을 새로고침해서 최신 데이터 반영
    revalidateNoticePaths();

    return { success: true };
  } catch {
    // 5️⃣ 에러 처리: DB 작업 중 예상치 못한 오류 발생
    return {
      success: false,
      error: "공지사항 생성에 실패했습니다.",
    };
  }
}

/**
 * updateNotice: 기존 공지사항 수정
 * 
 * 역할: ID로 기존 공지사항을 찾아 새로운 내용으로 수정합니다.
 * 
 * 과정:
 * 1. 관리자 권한 확인 - 일반 사용자는 접근 불가
 * 2. 공지사항 ID 검증 - UUID 형식이 맞는지 확인
 * 3. 입력값 검증 - 제목과 내용이 비어있지 않은지 확인
 * 4. DB 조작 - 해당 ID의 공지사항 정보를 업데이트
 * 5. 캐시 갱신 - 공지사항 페이지가 수정된 데이터를 보여주도록 갱신
 */
export async function updateNotice(id: string, formData: FormData): Promise<NoticeActionState> {
  // 1️⃣ 관리자 권한 확인
  await requireAdmin();

  // 2️⃣ 공지사항 ID 검증: 받은 ID가 정말 UUID 형식인지 확인
  const parsedId = noticeIdSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      error: "유효하지 않은 공지사항 ID입니다.",
    };
  }

  // 3️⃣ 입력값 검증: 폼 데이터가 규칙에 맞는지 확인
  const parsed = noticeFormSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
    status: formData.get("status"),
    pinned: parsePinned(formData.get("pinned")),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    };
  }

  try {
    // 4️⃣ DB 조작: ID가 일치하는 공지사항 행을 새로운 데이터로 수정
    await db
      .update(notices)
      .set({
        title: parsed.data.title,
        content: parsed.data.content,
        status: parsed.data.status,
        pinned: parsed.data.pinned,
      })
      .where(eq(notices.id, parsedId.data)); // WHERE 절: ID가 일치하는 행만 수정

    // 5️⃣ 캐시 갱신: 수정된 공지사항이 사용자에게 보이도록 갱신
    revalidateNoticePaths();

    return { success: true };
  } catch {
    // 에러 처리: DB 작업 중 예상치 못한 오류 발생
    return {
      success: false,
      error: "공지사항 수정에 실패했습니다.",
    };
  }
}

/**
 * deleteNotice: 공지사항 삭제
 * 
 * 역할: ID로 공지사항을 찾아 데이터베이스에서 완전히 삭제합니다.
 * 
 * 과정:
 * 1. 관리자 권한 확인 - 일반 사용자는 접근 불가
 * 2. 공지사항 ID 검증 - UUID 형식이 맞는지 확인
 * 3. DB 조작 - 해당 ID의 공지사항을 데이터베이스에서 제거
 * 4. 캐시 갱신 - 공지사항 목록이 삭제된 항목을 제외하고 보이도록 갱신
 */
export async function deleteNotice(id: string): Promise<NoticeActionState> {
  // 1️⃣ 관리자 권한 확인
  await requireAdmin();

  // 2️⃣ 공지사항 ID 검증: 받은 ID가 정말 UUID 형식인지 확인
  const parsedId = noticeIdSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      error: "유효하지 않은 공지사항 ID입니다.",
    };
  }

  try {
    // 3️⃣ DB 조작: ID가 일치하는 공지사항을 데이터베이스에서 삭제
    await db.delete(notices).where(eq(notices.id, parsedId.data));

    // 4️⃣ 캐시 갱신: 삭제된 공지사항이 목록에서 빠지도록 갱신
    revalidateNoticePaths();

    return { success: true };
  } catch {
    // 에러 처리: DB 작업 중 예상치 못한 오류 발생
    return {
      success: false,
      error: "공지사항 삭제에 실패했습니다.",
    };
  }
}

/**
 * togglePin: 공지사항 상단 고정 토글
 * 
 * 역할: 공지사항을 상단에 고정하거나 고정을 해제합니다.
 * 예를 들어, pinned가 true면 false로, false면 true로 바뀝니다.
 * 
 * 과정:
 * 1. 관리자 권한 확인 - 일반 사용자는 접근 불가
 * 2. 공지사항 ID 검증 - UUID 형식이 맞는지 확인
 * 3. DB 조회 - 현재 고정 상태를 데이터베이스에서 읽어옴
 * 4. DB 조작 - 고정 상태를 반대로 업데이트 (true ↔ false)
 * 5. 캐시 갱신 - 공지사항 페이지의 순서가 바뀌도록 갱신
 */
export async function togglePin(id: string): Promise<NoticeActionState> {
  // 1️⃣ 관리자 권한 확인
  await requireAdmin();

  // 2️⃣ 공지사항 ID 검증: 받은 ID가 정말 UUID 형식인지 확인
  const parsedId = noticeIdSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      error: "유효하지 않은 공지사항 ID입니다.",
    };
  }

  try {
    // 3️⃣ DB 조회: 현재 pinned 값을 데이터베이스에서 조회
    const [notice] = await db
      .select({ id: notices.id, pinned: notices.pinned })
      .from(notices)
      .where(eq(notices.id, parsedId.data))
      .limit(1); // 1개만 가져오기

    // 공지사항이 존재하지 않으면 오류 반환
    if (!notice) {
      return {
        success: false,
        error: "공지사항을 찾을 수 없습니다.",
      };
    }

    // 4️⃣ DB 조작: pinned 값을 반대로 변경 (!는 NOT 연산자: true → false, false → true)
    await db
      .update(notices)
      .set({ pinned: !notice.pinned })
      .where(eq(notices.id, parsedId.data));

    // 5️⃣ 캐시 갱신: 공지사항 순서가 바뀌었으므로 갱신
    revalidateNoticePaths();

    return { success: true };
  } catch {
    // 에러 처리: DB 작업 중 예상치 못한 오류 발생
    return {
      success: false,
      error: "고정 상태 변경에 실패했습니다.",
    };
  }
}

/**
 * toggleStatus: 공지사항 공개/비공개 토글
 * 
 * 역할: 공지사항의 상태를 전환합니다.
 * - "DRAFT" (임시저장) ↔ "PUBLISHED" (공개)
 * 임시저장이면 공개로, 공개면 임시저장으로 바뀝니다.
 * 
 * 과정:
 * 1. 관리자 권한 확인 - 일반 사용자는 접근 불가
 * 2. 공지사항 ID 검증 - UUID 형식이 맞는지 확인
 * 3. DB 조회 - 현재 상태(DRAFT 또는 PUBLISHED)를 데이터베이스에서 읽어옴
 * 4. DB 조작 - 상태를 반대로 업데이트 (DRAFT ↔ PUBLISHED)
 * 5. 캐시 갱신 - 공지사항 페이지가 공개 상태를 반영하도록 갱신
 */
export async function toggleStatus(id: string): Promise<NoticeActionState> {
  // 1️⃣ 관리자 권한 확인
  await requireAdmin();

  // 2️⃣ 공지사항 ID 검증: 받은 ID가 정말 UUID 형식인지 확인
  const parsedId = noticeIdSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      error: "유효하지 않은 공지사항 ID입니다.",
    };
  }

  try {
    // 3️⃣ DB 조회: 현재 status 값을 데이터베이스에서 조회
    const [notice] = await db
      .select({ id: notices.id, status: notices.status })
      .from(notices)
      .where(eq(notices.id, parsedId.data))
      .limit(1); // 1개만 가져오기

    // 공지사항이 존재하지 않으면 오류 반환
    if (!notice) {
      return {
        success: false,
        error: "공지사항을 찾을 수 없습니다.",
      };
    }

    // 4️⃣ DB 조작: status를 반대로 변경 (삼항 연산자 사용)
    // status가 "DRAFT"면 "PUBLISHED"로, 아니면 "DRAFT"로 변경
    await db
      .update(notices)
      .set({ status: notice.status === "DRAFT" ? "PUBLISHED" : "DRAFT" })
      .where(eq(notices.id, parsedId.data));

    // 5️⃣ 캐시 갱신: 공지사항 공개 상태가 바뀌었으므로 갱신
    revalidateNoticePaths();

    return { success: true };
  } catch {
    // 에러 처리: DB 작업 중 예상치 못한 오류 발생
    return {
      success: false,
      error: "상태 변경에 실패했습니다.",
    };
  }
}
