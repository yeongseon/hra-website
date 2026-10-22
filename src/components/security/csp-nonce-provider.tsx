"use client";

/**
 * 현재 문서 CSP의 nonce를 클라이언트 style 요소에 제공한다.
 * RSC 탐색·prefetch·refresh가 새 서버 nonce를 보내더라도 문서 CSP는 바뀌지 않으므로
 * 최초 마운트 값을 유지한다. 전체 문서 로드에서는 새 provider와 nonce가 생성된다.
 */
import { createContext, useContext, useState } from "react";

// 독립 에디터 미리보기처럼 HTML CSP를 제공하지 않는 소비자는 nonce가 필요하지 않다.
const CspNonceContext = createContext<string | undefined>(undefined);

/** 루트 레이아웃에서 검증한 초기 문서 nonce를 저장한다. */
export function CspNonceProvider({ nonce, children }: { nonce: string; children: React.ReactNode }) {
  const [documentNonce] = useState(nonce);
  return <CspNonceContext.Provider value={documentNonce}>{children}</CspNonceContext.Provider>;
}

/** 인쇄·에디터 스타일에 초기 문서 nonce를 적용한다. */
export function useCspNonce() {
  return useContext(CspNonceContext);
}
