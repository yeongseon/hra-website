/**
 * 실제 Radix 체크박스를 폼 안에서 클릭했을 때 값과 상위 클릭 이벤트가 일치하는지 검증합니다.
 * 공개 지원서의 동일 이름 복수 선택과 관리자 폼의 제어 상태를 합성 입력으로 재현합니다.
 */
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { Checkbox } from "@/components/ui/checkbox";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

afterEach(cleanup);

it("비제어 복수 선택의 추가·해제가 제출 값과 폼 클릭 이벤트에 반영된다", () => {
  const clicks: string[] = [];
  const submissions: string[][] = [];
  const { container } = render(
    <form
      onClick={(event) => clicks.push((event.target as HTMLElement).tagName)}
      onSubmit={(event) => {
        event.preventDefault();
        submissions.push(new FormData(event.currentTarget).getAll("q-c").map(String));
      }}
    >
      <Checkbox name="q-c" value="첫째" aria-label="첫째 선택" />
      <Checkbox name="q-c" value="둘째" aria-label="둘째 선택" />
      <button type="submit">제출</button>
    </form>,
  );
  const form = container.querySelector("form");
  if (!form) throw new Error("검증 폼을 찾지 못했습니다.");
  const first = screen.getByRole("checkbox", { name: "첫째 선택" });
  const second = screen.getByRole("checkbox", { name: "둘째 선택" });

  fireEvent.click(first);
  fireEvent.click(second);
  expect(new FormData(form).getAll("q-c")).toEqual(["첫째", "둘째"]);
  fireEvent.click(first);
  expect(new FormData(form).getAll("q-c")).toEqual(["둘째"]);
  expect(clicks).toEqual(["INPUT", "INPUT", "INPUT"]);

  fireEvent.submit(form);
  expect(submissions).toEqual([["둘째"]]);
});

it("제어 체크박스는 사용자 클릭만 폼에 알리고 외부 상태 변경도 제출 값에 반영한다", () => {
  const clicks: string[] = [];
  function ControlledForm() {
    const [checked, setChecked] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setChecked(true)}>외부에서 선택</button>
        <form onClick={(event) => clicks.push((event.target as HTMLElement).tagName)}>
          <Checkbox
            name="isRequired"
            value="yes"
            checked={checked}
            onCheckedChange={(next) => setChecked(next === true)}
            aria-label="필수 응답"
          />
        </form>
      </>
    );
  }
  const { container } = render(<ControlledForm />);
  const form = container.querySelector("form");
  if (!form) throw new Error("검증 폼을 찾지 못했습니다.");
  const checkbox = screen.getByRole("checkbox", { name: "필수 응답" });

  fireEvent.click(screen.getByRole("button", { name: "외부에서 선택" }));
  expect(new FormData(form).get("isRequired")).toBe("yes");
  expect(clicks).toHaveLength(0);

  fireEvent.click(checkbox);
  expect(new FormData(form).has("isRequired")).toBe(false);
  fireEvent.click(checkbox);
  expect(new FormData(form).get("isRequired")).toBe("yes");
  expect(clicks).toEqual(["INPUT", "INPUT"]);
});
