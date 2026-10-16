/** 요청 참조는 고정 UUID만 텍스트로 표시하며 오류 객체·URL·이메일을 렌더하지 않습니다. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AcademicRequestReference } from "@/components/academics/request-reference";
it.each([undefined,null,"","https://private.invalid/token","synthetic@example.invalid",new Error("SELECT 비공개"),{referenceId:"10000000-0000-4000-8000-000000000001"}])("잘못된 참조를 표시하지 않는다",referenceId=>{
 expect(renderToStaticMarkup(createElement(AcademicRequestReference,{referenceId}))).toBe("");
});
it("서버 UUID 필드만 한국어 텍스트로 표시한다",()=>{
 expect(renderToStaticMarkup(createElement(AcademicRequestReference,{referenceId:"10000000-0000-4000-8000-000000000001"}))).toContain("요청 참조: 10000000-0000-4000-8000-000000000001");
});
