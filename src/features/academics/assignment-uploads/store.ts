/** 학사 전용 비공개 저장소 설정. 설정 누락 시 공개 저장소로 대체하지 않는다. */
import "server-only";
import { AcademicUploadError } from "./contract";
export function academicSubmissionStore() {
  const host=process.env.ACADEMIC_SUBMISSION_BLOB_HOST;
  const token=process.env.ACADEMIC_SUBMISSION_READ_WRITE_TOKEN;
  if (!host || !token || !/^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/.test(host)) throw new AcademicUploadError("UNAVAILABLE");
  return {host,token};
}
export function matchesAcademicBlob(url: string, pathname: string): boolean {
  try {
    const parsed=new URL(url);
    return parsed.protocol==="https:" && parsed.host===academicSubmissionStore().host &&
      !parsed.username && !parsed.password && !parsed.search && !parsed.hash && parsed.pathname===`/${pathname}`;
  } catch { return false; }
}
