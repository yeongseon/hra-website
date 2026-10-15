/** 보호 자료 업로드 전에 서버가 선택한 Blob 접근 모드를 확인합니다. */
export async function resourceUploadAccess(path: string): Promise<"public" | "private"> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error("업로드 저장소를 사용할 수 없습니다.");
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("access" in data) ||
      (data.access !== "public" && data.access !== "private")) {
    throw new Error("업로드 저장소 응답이 올바르지 않습니다.");
  }
  return data.access;
}
