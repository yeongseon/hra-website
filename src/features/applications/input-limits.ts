/**
 * 공개 지원서의 입력 길이 상한입니다.
 * 기본 정보는 DB varchar 길이와 맞추고, 자유 입력과 선택지는 요청 크기를 제한합니다.
 * 서버 검증과 작성 화면이 같은 값을 사용합니다.
 */
export const applicationInputLimits = {
  applicantName: 100,
  applicantEmail: 255,
  applicantPhone: 20,
  shortAnswer: 1000,
  longAnswer: 10000,
  optionValue: 1000,
  checkboxAnswer: 10000,
} as const;
