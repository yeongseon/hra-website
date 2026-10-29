/**
 * 지원서 질문 버전·저장·제출 검증 함수의 변경 계획을 안내하는 차단형 CLI입니다.
 * 신뢰된 대상·복구·승인 경계가 마련되기 전에는 DB 드라이버·자격정보·SQL 원문을 읽지 않습니다.
 * 기존 컬럼 추가와 두 함수의 결합 업그레이드는 #280의 신뢰된 적용 경로가 준비될 때까지 비활성입니다.
 * 원본 SQL과 신규 설치 후보를 유지한 사실이 기존 DB 업그레이드 검증을 대신하지는 않습니다.
 */

/** 인자에 포함된 URL·승인 문서·자격정보를 반사하지 않고 계획 또는 고정 오류만 제공합니다. */
function run(args) {
  if (args.length === 0) {
    console.log("지원서 질문 변경 계획: questions_revision 컬럼·질문 저장 함수·제출 버전 검증 함수. 기존 DB의 결합 업그레이드는 비활성이며 접속·변경하지 않습니다. [ATOMIC_QUESTION_INSTALLER_PLAN]");
    return 0;
  }
  if (args.length === 1 && args[0] === "--confirm-apply") {
    console.error("적용 의도만으로 대상·복구·승인을 확인할 수 없어 직접 적용을 차단합니다. [ATOMIC_QUESTION_INSTALLER_TARGET_UNTRUSTED]");
    return 1;
  }
  console.error("지원하지 않는 인자입니다. 인자 없이 변경 계획을 확인하세요. [ATOMIC_QUESTION_INSTALLER_ARGUMENTS]");
  return 1;
}

// 프로젝트 기준인 Node 24의 직접 실행 표식으로 모듈 import 시 출력·종료 부작용을 막습니다.
if (import.meta.main) process.exitCode = run(process.argv.slice(2));
