/**
 * 공개 지원서 폼 회귀 테스트 (#111)
 *
 * 검증 대상 (public-application-form.tsx):
 *   - 제출이 실패(중복 이메일 등)해도 지원자가 입력한 내용이 지워지지 않는다.
 *   - 그 상태에서 다시 제출하면 같은 값이 그대로 전송된다.
 *
 * 배경: React 19 는 <form action> 으로 실행한 액션이 끝나면 비제어 입력을 초기화한다.
 *   이 폼은 onSubmit 에서 직접 FormData 를 넘겨 그 초기화를 피한다.
 *
 * 서버 액션은 실패 응답을 돌려주는 가짜로 대체한다 (DB·네트워크 사용 없음).
 * 이 저장소의 단위 테스트는 .ts 만 수집하므로 JSX 대신 createElement 를 쓴다.
 */

import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// 가짜 서버 액션이 받은 FormData 를 순서대로 기록한다.
const submitted: FormData[] = [];

vi.mock("@/features/applications/actions/submissions", () => ({
  submitApplicationForm: async (_previous: unknown, formData: FormData) => {
    submitted.push(formData);
    return { success: false, message: "이미 같은 이메일로 이 지원서를 제출하셨습니다." };
  },
}));

import { PublicApplicationForm } from "@/app/(public)/recruitment/apply/[id]/_components/public-application-form";
import { applicationInputLimits } from "@/features/applications/input-limits";

const FORM = { id: "00000000-0000-4000-8000-000000000000", title: "지원서", description: null };
const QUESTIONS = [
  { id: "s", title: "단답", description: null, type: "SHORT_ANSWER" as const, isRequired: true, options: [] },
  { id: "l", title: "서술", description: null, type: "LONG_ANSWER" as const, isRequired: true, options: [] },
  {
    id: "m",
    title: "객관식",
    description: null,
    type: "MULTIPLE_CHOICE" as const,
    isRequired: false,
    options: [
      { id: "m1", value: "A" },
      { id: "m2", value: "B" },
    ],
  },
  {
    id: "c",
    title: "체크",
    description: null,
    type: "CHECKBOX" as const,
    isRequired: false,
    options: [
      { id: "c1", value: "X" },
      { id: "c2", value: "Y" },
    ],
  },
];

beforeAll(() => {
  // Radix 컴포넌트가 jsdom 에 없는 ResizeObserver 를 사용한다.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  submitted.length = 0;
});

describe("PublicApplicationForm — 제출 실패 후 입력 유지", () => {
  it("오류가 표시된 뒤에도 입력값이 남고, 다시 제출하면 같은 값이 전송된다", async () => {
    const { container } = render(createElement(PublicApplicationForm, { form: FORM, questions: QUESTIONS }));
    const field = <T extends HTMLElement>(selector: string) => {
      const element = container.querySelector<T>(selector);
      if (!element) throw new Error(`요소를 찾지 못했습니다: ${selector}`);
      return element;
    };
    const form = field<HTMLFormElement>("form");

    // 브라우저 입력 상한이 서버의 DB·답변 길이 상한과 일치해야 합니다 (#112).
    for (const [selector, maxLength] of [
      ['[name="applicantName"]', applicationInputLimits.applicantName],
      ['[name="applicantEmail"]', applicationInputLimits.applicantEmail],
      ['[name="applicantPhone"]', applicationInputLimits.applicantPhone],
      ['[name="q-s"]', applicationInputLimits.shortAnswer],
      ['textarea[name="q-l"]', applicationInputLimits.longAnswer],
    ] as const) {
      expect(field(selector).getAttribute("maxlength")).toBe(String(maxLength));
    }

    fireEvent.change(field('[name="applicantName"]'), { target: { value: "홍길동" } });
    fireEvent.change(field('[name="applicantEmail"]'), { target: { value: "applicant@example.com" } });
    fireEvent.change(field('[name="applicantPhone"]'), { target: { value: "010-1234-5678" } });
    fireEvent.change(field('[name="q-s"]'), { target: { value: "짧은 답" } });
    fireEvent.change(field('textarea[name="q-l"]'), { target: { value: "오래 걸려 쓴 긴 서술형 답변" } });
    await act(async () => {
      fireEvent.click(field("#opt-m2"));
    });
    await act(async () => {
      fireEvent.click(field("#opt-c1"));
    });

    const expected = [
      ["applicantName", "홍길동"],
      ["applicantEmail", "applicant@example.com"],
      ["applicantPhone", "010-1234-5678"],
      ["q-s", "짧은 답"],
      ["q-l", "오래 걸려 쓴 긴 서술형 답변"],
      ["q-m", "B"],
      ["q-c", "X"],
    ];
    // 비교 대상이 아닌 숨김 필드(formId, honeypot)는 제외한다.
    const pick = (formData: FormData) =>
      Array.from(formData.entries())
        .filter(([key]) => key.startsWith("applicant") || key.startsWith("q-"))
        .map(([key, value]) => [key, String(value)]);

    await act(async () => {
      fireEvent.submit(form);
    });
    await waitFor(() => screen.getByText(/이미 같은 이메일/));

    expect(submitted).toHaveLength(1);
    expect(pick(submitted[0])).toEqual(expected);

    // 실패 응답 뒤: 화면의 입력값이 그대로다.
    expect(field<HTMLInputElement>('[name="applicantName"]').value).toBe("홍길동");
    expect(field<HTMLInputElement>('[name="applicantEmail"]').value).toBe("applicant@example.com");
    expect(field<HTMLInputElement>('[name="applicantPhone"]').value).toBe("010-1234-5678");
    expect(field<HTMLInputElement>('[name="q-s"]').value).toBe("짧은 답");
    expect(field<HTMLTextAreaElement>('textarea[name="q-l"]').value).toBe("오래 걸려 쓴 긴 서술형 답변");
    expect(field("#opt-m2").getAttribute("aria-checked")).toBe("true");
    expect(field("#opt-c1").getAttribute("aria-checked")).toBe("true");

    // 다시 제출하면 같은 값이 전송된다 (보이기만 하고 값이 빠지는 일이 없다).
    await act(async () => {
      fireEvent.submit(form);
    });
    await waitFor(() => expect(submitted).toHaveLength(2));
    expect(pick(submitted[1])).toEqual(expected);
  });
});
