// @vitest-environment node
/** 정리는 기본 비활성/dry-run이며 DB 선점·정확한 비공개 객체 버전 확인 뒤에만 삭제한다. */
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({execute:vi.fn(),head:vi.fn(),del:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/db",()=>({db:{execute:mocks.execute}}));
vi.mock("@vercel/blob",()=>({head:mocks.head,del:mocks.del,BlobNotFoundError:class extends Error{}}));
vi.mock("@/features/academics/assignment-uploads/repository",()=>({withUploadDatabaseErrors:(operation:()=>Promise<unknown>)=>operation()}));
import { cleanupAcademicUploads } from "@/features/academics/assignment-uploads/cleanup";
const id="10000000-0000-4000-8000-000000000001",key=`academic-uploads/v1/${id}/document.pdf`,host="qa151.private.blob.vercel-storage.com";
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv("ACADEMIC_UPLOAD_CLEANUP_ENABLED","true");vi.stubEnv("ACADEMIC_UPLOAD_CLEANUP_DELETE_ENABLED","false");vi.stubEnv("ACADEMIC_SUBMISSION_BLOB_HOST",host);vi.stubEnv("ACADEMIC_SUBMISSION_READ_WRITE_TOKEN","test-only");
 mocks.execute.mockResolvedValueOnce({rows:[{id,storage_key:key}]}).mockResolvedValueOnce({rows:[{claimed:true}]}).mockResolvedValue({rows:[]});
 mocks.head.mockResolvedValue({url:`https://${host}/${key}`,pathname:key,etag:"verified-etag"});
});
afterEach(()=>vi.unstubAllEnvs());
describe("미참조 업로드 정리",()=>{
 it("비활성 기본값은 DB와 저장소를 조회하지 않는다",async()=>{
  vi.stubEnv("ACADEMIC_UPLOAD_CLEANUP_ENABLED",undefined);expect(await cleanupAcademicUploads()).toMatchObject({enabled:false,dryRun:true});expect(mocks.execute).not.toHaveBeenCalled();expect(mocks.head).not.toHaveBeenCalled();
 });
 it("기본 dry-run과 삭제flag 없는 명시 요청은 선점·삭제하지 않는다",async()=>{
  expect(await cleanupAcademicUploads({dryRun:false})).toMatchObject({dryRun:true,candidates:1,deleted:0});expect(mocks.execute).toHaveBeenCalledTimes(1);expect(mocks.del).not.toHaveBeenCalled();
  const rendered=new PgDialect().sqlToQuery(mocks.execute.mock.calls[0][0]);expect(rendered.sql).toContain("NOT EXISTS");expect(rendered.sql).toContain("assignment_submission_files");expect(rendered.sql).toContain("a.deleted_at");
 });
 it("DB 원자 선점을 못한 객체는 읽거나 삭제하지 않는다",async()=>{
  vi.stubEnv("ACADEMIC_UPLOAD_CLEANUP_DELETE_ENABLED","true");mocks.execute.mockReset().mockResolvedValueOnce({rows:[{id,storage_key:key}]}).mockResolvedValueOnce({rows:[{claimed:false}]});
  expect(await cleanupAcademicUploads({dryRun:false})).toMatchObject({deleted:0});expect(mocks.head).not.toHaveBeenCalled();expect(mocks.del).not.toHaveBeenCalled();
 });
 it("정확한 namespace·버전만 조건부 삭제하고 원장은 남긴다",async()=>{
  vi.stubEnv("ACADEMIC_UPLOAD_CLEANUP_DELETE_ENABLED","true");expect(await cleanupAcademicUploads({dryRun:false})).toMatchObject({deleted:1,failed:0});
  expect(mocks.del).toHaveBeenCalledWith(key,expect.objectContaining({ifMatch:"verified-etag"}));
  const update=new PgDialect().sqlToQuery(mocks.execute.mock.calls[2][0]);expect(update.sql).toContain("UPDATE academic_upload_authorizations");expect(update.sql).not.toContain("DELETE FROM");
 });
 it("다른 저장 경로·호스트는 삭제하지 않는다",async()=>{
  vi.stubEnv("ACADEMIC_UPLOAD_CLEANUP_DELETE_ENABLED","true");mocks.head.mockResolvedValue({url:"https://other.invalid/file",pathname:key,etag:"x"});
  expect(await cleanupAcademicUploads({dryRun:false})).toMatchObject({deleted:0,failed:1});expect(mocks.del).not.toHaveBeenCalled();
 });
 it("삭제 실패를 성공으로 기록하지 않고 재시도 가능한 원장을 보존한다",async()=>{
  vi.stubEnv("ACADEMIC_UPLOAD_CLEANUP_DELETE_ENABLED","true");mocks.del.mockRejectedValue(new Error("일시 실패"));expect(await cleanupAcademicUploads({dryRun:false})).toMatchObject({deleted:0,failed:1});expect(mocks.execute).toHaveBeenCalledTimes(2);
 });
});
