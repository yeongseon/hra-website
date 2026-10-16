/** React 커밋 중 발생하는 기본 reset도 취소하여 오류 재시도 시 입력과 확인 체크를 유지한다. */
export function preserveAssignmentForm(form: HTMLFormElement | null): void {
  // React 합성 이벤트가 잠시 중지된 커밋 단계에서도 실행되는 네이티브 이벤트를 사용한다.
  if (form) form.onreset = event => event.preventDefault();
}
