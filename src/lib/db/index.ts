/**
 * 데이터베이스 연결 설정 파일
 * 
 * Neon Postgres와 Drizzle ORM을 사용해 데이터베이스 연결을 관리합니다.
 * 싱글톤 패턴으로 DB 연결을 캐시하므로, 매번 새로운 연결이 생성되지 않습니다.
 */

// Neon Postgres 클라이언트 생성 라이브러리
import { neon } from "@neondatabase/serverless";
// Drizzle ORM: 자바스크립트 코드로 데이터베이스를 쉽게 다루는 도구
import { drizzle, NeonHttpDatabase } from "drizzle-orm/neon-http";
// 이 폴더의 schema.ts에서 정의한 데이터베이스 테이블 스키마
import * as schema from "./schema";

/**
 * DB 연결 인스턴스를 캐시하는 변수
 * 
 * null로 시작했다가, getDb()가 처음 호출될 때 연결을 생성합니다.
 * 이후로는 같은 연결 객체를 계속 사용합니다. (매번 새로 연결하지 않기 위해)
 */
let _db: NeonHttpDatabase<typeof schema> | null = null;

/**
 * DB 연결을 생성하고 반환하는 함수 (싱글톤 패턴)
 * 
 * 처음 호출될 때만 새 연결을 만들고,
 * 이후 호출에서는 이미 만들어진 연결을 반환합니다.
 * 
 * @returns {NeonHttpDatabase} 데이터베이스 연결 객체
 * @throws {Error} DATABASE_URL이 설정되지 않으면 에러를 던집니다
 */
export function getDb() {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Please configure your .env file."
      );
    }
    const sql = neon(url);
    _db = drizzle(sql, { schema });
  }
  return _db;
}

/**
 * db 객체를 바로 사용할 수 있도록 하는 프록시
 * 
 * Proxy를 사용하면, 실제 데이터베이스 메서드에 접근할 때
 * 자동으로 getDb()를 호출해 DB 연결을 확인할 수 있습니다.
 * 
 * 예: db.select() 호출 → 자동으로 getDb() 실행 → DB 연결됨
 */
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
