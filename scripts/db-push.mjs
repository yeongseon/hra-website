/**
 * 검증되지 않은 대상에 전체 스키마 차이를 적용하지 않도록 기본 push를 차단한다.
 * DB·환경 파일·자격정보를 읽거나 다른 실행기를 시작하지 않는다.
 * 명시적 접속 인자나 자체 승인 파일도 이 명령의 적용 권한이 되지 않는다.
 */
console.error("db:push는 비활성화되어 있습니다. DB에 접속하지 않았습니다. 스키마 SQL 생성은 drizzle-kit export를 사용하고, 적용 절차는 docs/developer/database-change-procedure.md를 확인하세요.");
process.exitCode = 1;
