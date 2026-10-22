/**
 * 서버 화면의 동일 렌더 패스에서 세션 조회만 공유합니다 (#334).
 * 회원·관리자·학사 인가 헬퍼가 사용하며 각 헬퍼의 권한 검사는 생략하지 않습니다.
 * React cache는 다음 요청으로 결과를 넘기지 않아 JWT의 DB 재검증을 유지합니다.
 */
import "server-only";
import { cache } from "react";
import { auth } from "@/lib/auth";

// 모듈당 하나의 함수를 공유합니다. 렌더 밖의 액션·Route 호출에는 메모이제이션이 없습니다.
export const getRequestSession = cache(() => auth());
