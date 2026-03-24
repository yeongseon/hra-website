/**
 * ======================================================
 * Drizzle ORM 설정 파일
 * ======================================================
 * 
 * Drizzle은 데이터베이스를 쉽게 관리하는 도구입니다.
 * 
 * 이 설정 파일의 주요 역할:
 * 1. 테이블 구조 정의 파일 위치 알려주기 (schema.ts)
 * 2. 데이터베이스 변경사항을 기록하는 마이그레이션 파일 저장 위치 설정
 * 3. 사용할 데이터베이스 종류 명시 (PostgreSQL)
 * 4. 데이터베이스 연결 정보 제공
 * 
 * 예를 들어:
 * - schema.ts에서 "사용자" 테이블을 새로 만들었다
 * - npx drizzle-kit generate 명령어를 실행하면
 * - ./drizzle 폴더에 그 변화를 기록한 파일이 생성됨
 * - npx drizzle-kit push 명령어를 실행하면 실제 DB에 반영됨
 */

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // 데이터베이스 테이블 구조를 정의한 파일 경로
  // 여기서 "사용자", "공지사항" 같은 테이블이 정의됩니다
  schema: "./src/lib/db/schema.ts",
  
  // 마이그레이션 파일이 저장될 폴더
  // npm 패키지에 의해 자동 생성되는 SQL 파일들이 여기 저장됩니다
  out: "./drizzle",
  
  // 사용하는 데이터베이스 종류 (우리는 PostgreSQL 사용)
  dialect: "postgresql",
  
  // 데이터베이스 연결 정보
  dbCredentials: {
    // DATABASE_URL은 .env 파일에서 가져옵니다
    // 예: postgresql://username:password@host:5432/dbname
    url: process.env.DATABASE_URL!,
  },
});
