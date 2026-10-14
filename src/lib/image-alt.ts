/**
 * 수업일지와 주차별 텍스트에 첨부한 사진의 설명을 만듭니다 (#90).
 * 제목은 300자까지 입력되지만 이미지 alt 컬럼은 255자이므로,
 * 사진 번호 접미사를 먼저 확보한 뒤 제목만 필요한 만큼 줄입니다.
 */

const maxImageAltLength = 255;

/** 여러 장의 사진에서도 번호 자릿수를 포함해 DB 길이 제한을 지킵니다. */
export function buildImageAlt(title: string, imageNumber: number): string {
  const suffix = ` 사진 ${imageNumber}`;
  const titleLength = maxImageAltLength - Array.from(suffix).length;

  // 코드 포인트 단위로 자르면 이모지 등의 서로게이트 쌍이 깨지지 않습니다.
  return `${Array.from(title).slice(0, titleLength).join("")}${suffix}`;
}
