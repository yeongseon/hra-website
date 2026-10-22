/** 문서 nonce가 RSC 갱신 동안 유지되고 새 문서에서만 교체되는지 검증한다. */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CspNonceProvider, useCspNonce } from "@/components/security/csp-nonce-provider";

afterEach(cleanup);

// 초기 마운트 및 나중에 추가되는 style 소비자가 같은 문서 nonce를 읽어야 한다.
function Consumer({ name }: { name: string }) {
  const nonce = useCspNonce();
  return <style data-testid={name} nonce={nonce}>{"body { color: inherit; }"}</style>;
}

it("서버 prop 갱신과 새 소비자 마운트에서도 초기 문서 nonce를 유지한다", () => {
  const view = render(<CspNonceProvider nonce="document-one"><Consumer name="first" /></CspNonceProvider>);
  expect(screen.getByTestId("first").nonce).toBe("document-one");
  view.rerender(<CspNonceProvider nonce="rsc-two"><Consumer name="first" /><Consumer name="later" /></CspNonceProvider>);
  expect(screen.getByTestId("first").nonce).toBe("document-one");
  expect(screen.getByTestId("later").nonce).toBe("document-one");
  view.unmount();
  render(<CspNonceProvider nonce="new-document"><Consumer name="reloaded" /></CspNonceProvider>);
  expect(screen.getByTestId("reloaded").nonce).toBe("new-document");
});

it("실제 TipTap이 주입하는 CSS도 초기 문서 nonce를 유지한다", async () => {
  const { RichTextEditor } = await import("@/components/admin/rich-text-editor");
  const { waitFor } = await import("@testing-library/react");
  // 독립 테스트 문서에 남아 있는 공급자 스타일을 재사용하지 않고 실제 생성 경로를 검사한다.
  document.querySelectorAll("style[data-tiptap-style]").forEach(style => style.remove());
  const view = render(<CspNonceProvider nonce="document-editor"><RichTextEditor name="body" defaultValue="합성 본문" /></CspNonceProvider>);
  await waitFor(() => expect(view.container.querySelector(".ProseMirror")).not.toBeNull());
  expect(document.querySelector<HTMLStyleElement>("style[data-tiptap-style]")?.nonce).toBe("document-editor");
  expect(view.container.querySelector("style")?.nonce).toBe("document-editor");
  view.rerender(<CspNonceProvider nonce="rsc-editor"><RichTextEditor key="remounted" name="body" defaultValue="합성 본문" /></CspNonceProvider>);
  await waitFor(() => expect(view.container.querySelector(".ProseMirror")).not.toBeNull());
  expect(document.querySelector<HTMLStyleElement>("style[data-tiptap-style]")?.nonce).toBe("document-editor");
  expect(view.container.querySelector("style")?.nonce).toBe("document-editor");
  view.unmount();
  document.querySelectorAll("style[data-tiptap-style]").forEach(style => style.remove());
});
