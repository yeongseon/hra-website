/**
 * 모집설정의 고정 키·제약·기본 행 변경 계획을 안내하는 차단형 CLI입니다.
 * 신뢰된 대상·복구·승인 경계가 준비되기 전에는 DB·자격정보·파일을 읽거나 연결하지 않습니다.
 * 기존 복수 행 사전 검사·컬럼/제약/기본 행 결합 적용·사후 단일 행 검증은 #280의 신뢰된 업그레이드까지 비활성입니다.
 * 기본 행 INSERT의 선언만 보존하며 신규 설치 검증이 기존 DB의 결합 업그레이드를 대신하지는 않습니다.
 */

// 기존 51행의 보간 없는 INSERT 원문을 그대로 보존합니다. 공개 CLI는 이 선언을 실행하지 않습니다.
export const recruitmentDefaultInsertSql = "INSERT INTO recruitment_settings (singleton_key) VALUES (1) ON CONFLICT (singleton_key) DO NOTHING";

/** URL·승인 문서·자격정보를 반사하지 않고 계획 또는 고정 오류만 제공합니다. */
function run(args) {
  if (args.length === 0) {
    console.log("모집설정 변경 계획: 고정 키·CHECK/UNIQUE 제약과 기본 행. 기존 DB의 결합 업그레이드는 비활성이며 접속·변경하지 않습니다. [RECRUITMENT_INSTALLER_PLAN]");
    return 0;
  }
  if (args.length === 1 && args[0] === "--confirm-apply") {
    console.error("적용 의도만으로 대상·복구·승인을 확인할 수 없어 직접 적용을 차단합니다. [RECRUITMENT_INSTALLER_TARGET_UNTRUSTED]");
    return 1;
  }
  console.error("지원하지 않는 인자입니다. 인자 없이 변경 계획을 확인하세요. [RECRUITMENT_INSTALLER_ARGUMENTS]");
  return 1;
}

// 프로젝트 기준인 Node 24의 직접 실행 표식으로 모듈 import 시 출력·종료 부작용을 막습니다.
if (import.meta.main) process.exitCode = run(process.argv.slice(2));
