/**
 * 스키마 소스에서 SQL·마이그레이션 파일을 생성하는 오프라인 Drizzle 설정이다.
 * 환경 파일과 DB 자격정보를 읽지 않아 기본 push/migrate의 자동 접속을 차단한다.
 * 별도 설정·명시적 CLI 접속 인자를 사용하는 운영자 권한까지 제한하는 장치는 아니다.
 */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
});
