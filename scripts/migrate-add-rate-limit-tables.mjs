/**
 * 기존 로그인·업로드 시도 로그 두 테이블과 세 인덱스의 변경 계획을 안내하는 차단형 CLI입니다.
 * 신뢰된 대상·복구·승인 경계가 마련되기 전에는 DB·자격정보·파일을 읽거나 연결하지 않습니다.
 * 기존 사전 검사·대상별 설치 트랜잭션·사후 검증은 신뢰된 기존 DB 업그레이드까지 비활성입니다.
 * 현재 로그 기록·요청 제한과 예약 설치 경로는 유지되며 이 계획은 DB 사전 점검 결과가 아닙니다.
 */

/** URL·승인 문서·자격정보를 반사하지 않고 계획 또는 고정 오류만 제공합니다. */
function run(args) {
  if (args.length === 0) {
    console.log("기존 요청 제한 로그 변경 계획: login_attempts·upload_rate_limit_log 두 테이블과 세 인덱스. 직접 설치와 사전·사후 검증은 비활성이며 접속·변경하지 않습니다. [LEGACY_RATE_TABLE_INSTALLER_PLAN]");
    return 0;
  }
  if (args.length === 1 && args[0] === "--confirm-apply") {
    console.error("적용 의도만으로 대상·복구·승인을 확인할 수 없어 직접 적용을 차단합니다. [LEGACY_RATE_TABLE_INSTALLER_TARGET_UNTRUSTED]");
    return 1;
  }
  console.error("지원하지 않는 인자입니다. 인자 없이 변경 계획을 확인하세요. [LEGACY_RATE_TABLE_INSTALLER_ARGUMENTS]");
  return 1;
}

// 프로젝트 기준인 Node 24의 직접 실행 표식으로 모듈 import 시 출력·종료 부작용을 막습니다.
if (import.meta.main) process.exitCode = run(process.argv.slice(2));
