/** 네트워크나 개인정보 없이 생성한 1×1 PNG로 실제 이미지 디코딩 경로를 검증합니다. */
export function syntheticPng(): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4////fwAJ+wP9CNHoHgAAAABJRU5ErkJggg==", "base64"));
}
