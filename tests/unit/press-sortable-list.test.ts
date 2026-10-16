/** 실제 언론보도 목록의 삭제·순서 저장 실패 복구와 중복 요청 차단을 검증한다. */
import { Component, createElement, type ComponentProps, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(), remove: vi.fn(), reorder: vi.fn(), rejectedClick: vi.fn(), renderFailure: vi.fn(),
}));
vi.mock("@/features/press/actions", () => ({
  deletePressArticle: mocks.remove, reorderPressArticles: mocks.reorder,
}));
vi.mock("@/components/ui/button", async importOriginal => {
  const actual = await importOriginal<typeof import("@/components/ui/button")>();
  const { createElement } = await import("react");
  type ButtonProps = ComponentProps<typeof actual.Button>;
  return { ...actual, Button: (props: ButtonProps) => {
    // 실제 버튼을 유지하고 이벤트 밖으로 새는 비동기 실패만 관찰한다. 성공 조건은 누출 0건이다.
    const onClick: ButtonProps["onClick"] = event => {
      const pending: unknown = props.onClick?.(event);
      if (pending instanceof Promise) void pending.catch(() => mocks.rejectedClick());
    };
    return createElement(actual.Button, { ...props, onClick });
  } };
});
import { PressSortableList } from "@/app/(admin)/admin/press/_components/press-sortable-list";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const firstTitle = "첫 번째 합성 기사";
const secondTitle = "두 번째 합성 기사";
const internalError = "합성_내부_통신_실패_노출금지";
const articles = [
  { id: firstId, title: firstTitle, source: "합성 언론 가", publishedAt: new Date("2026-10-16T00:00:00Z") },
  { id: secondId, title: secondTitle, source: "합성 언론 나", publishedAt: new Date("2026-10-15T00:00:00Z") },
];

/** React의 순서 저장 전이 오류도 앱이 처리해야 하며 테스트의 외부 예외로 흘리지 않는다. */
class FailureBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? createElement("p", null, "목록 처리 오류 경계") : this.props.children; }
}

function showList() {
  return render(createElement(FailureBoundary, null, createElement(PressSortableList, { initialItems: articles })), {
    onCaughtError: () => mocks.renderFailure(),
  });
}
function row(title: string) { return screen.getByRole("row", { name: new RegExp(title) }); }
function removeButton(title: string) { return within(row(title)).getByRole("button", { name: "삭제" }); }
function titles() {
  return screen.getAllByRole("row").flatMap(item => articles
    .filter(article => within(item).queryByText(article.title))
    .map(article => article.title));
}
function drag(from: string, to: string) {
  const source = row(from), destination = row(to);
  fireEvent.dragStart(source, { dataTransfer: { effectAllowed: "" } });
  fireEvent.dragOver(destination, { dataTransfer: { dropEffect: "" } });
  fireEvent.drop(destination);
}
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("합성 요청의 완료 함수를 준비하지 못했습니다."); };
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("confirm", mocks.confirm);
  mocks.confirm.mockReturnValue(true);
  mocks.remove.mockResolvedValue(undefined);
  mocks.reorder.mockResolvedValue({ success: true, message: "순서를 저장했습니다." });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("언론보도 목록의 삭제 복구", () => {
  it("삭제 확인을 취소하면 요청과 표시 행을 유지한다", () => {
    mocks.confirm.mockReturnValue(false);
    showList(); fireEvent.click(removeButton(firstTitle));
    expect(mocks.confirm).toHaveBeenCalledWith("정말 삭제하시겠습니까?");
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(titles()).toEqual([firstTitle, secondTitle]);
    expect(screen.getByText("전체 언론보도 2건")).toBeTruthy();
  });

  it("삭제 성공 뒤 해당 기사만 제거하고 나머지 행과 건수를 유지한다", async () => {
    showList(); fireEvent.click(removeButton(firstTitle));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(firstId));
    await waitFor(() => expect(screen.queryByText(firstTitle)).toBeNull());
    expect(titles()).toEqual([secondTitle]);
    expect(screen.getByText("전체 언론보도 1건")).toBeTruthy();
  });

  it("통신 실패는 원문 대신 한국어로 알리고 행을 보존하여 같은 기사를 재시도한다", async () => {
    mocks.remove.mockRejectedValueOnce(new Error(internalError));
    showList(); fireEvent.click(removeButton(firstTitle));
    await waitFor(() => expect(screen.getByText(/삭제.*(?:실패|못|오류)/)).toBeTruthy());
    expect(titles()).toEqual([firstTitle, secondTitle]);
    expect(screen.getByText("전체 언론보도 2건")).toBeTruthy();
    expect(screen.queryByText(internalError)).toBeNull();
    expect(mocks.rejectedClick).not.toHaveBeenCalled();
    fireEvent.click(removeButton(firstTitle));
    await waitFor(() => expect(screen.queryByText(firstTitle)).toBeNull());
    expect(mocks.remove.mock.calls).toEqual([[firstId], [firstId]]);
    expect(titles()).toEqual([secondTitle]);
    expect(screen.queryByText(/삭제.*(?:실패|못|오류)/)).toBeNull();
  });

  it("같은 행을 연속 클릭해도 진행 중 삭제 요청을 중복 전송하지 않는다", async () => {
    const pending = deferred<void>(); mocks.remove.mockReturnValue(pending.promise);
    showList(); const button = removeButton(firstTitle);
    try {
      act(() => { fireEvent.click(button); fireEvent.click(button); });
      expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(firstId);
    } finally { await act(async () => pending.resolve()); }
    expect(screen.queryByText(firstTitle)).toBeNull();
    expect(titles()).toEqual([secondTitle]);
  });
});

describe("언론보도 목록의 순서 저장 복구", () => {
  it("성공한 순서 저장은 실제 행 순서와 같은 전체 ID를 전달한다", async () => {
    showList(); drag(firstTitle, secondTitle);
    await waitFor(() => expect(mocks.reorder).toHaveBeenCalledExactlyOnceWith([secondId, firstId]));
    expect(titles()).toEqual([secondTitle, firstTitle]);
  });

  it("서버가 반환한 저장 실패는 이전 순서와 한국어 안내를 유지한다", async () => {
    const message = "일부 항목을 저장하지 못했습니다.";
    mocks.reorder.mockResolvedValueOnce({ success: false, message });
    showList(); drag(firstTitle, secondTitle);
    await waitFor(() => expect(screen.getByText(message)).toBeTruthy());
    expect(titles()).toEqual([firstTitle, secondTitle]);
    expect(mocks.renderFailure).not.toHaveBeenCalled();
  });

  it("순서 저장 통신 실패도 전체 행과 순서를 복원하고 재시도할 수 있다", async () => {
    mocks.reorder.mockRejectedValueOnce(new Error(internalError));
    showList(); drag(firstTitle, secondTitle);
    await waitFor(() => expect(screen.getByText(/순서.*(?:실패|못|오류)/)).toBeTruthy());
    expect(titles()).toEqual([firstTitle, secondTitle]);
    expect(screen.queryByText(internalError)).toBeNull();
    expect(mocks.renderFailure).not.toHaveBeenCalled();
    drag(firstTitle, secondTitle);
    await waitFor(() => expect(mocks.reorder).toHaveBeenCalledTimes(2));
    expect(mocks.reorder.mock.calls).toEqual([[[secondId, firstId]], [[secondId, firstId]]]);
    expect(titles()).toEqual([secondTitle, firstTitle]);
    expect(screen.queryByText(/순서.*(?:실패|못|오류)/)).toBeNull();
  });

  it("순서 저장 중 다시 드롭해도 중복 저장하지 않는다", async () => {
    const pending = deferred<{ success: boolean; message: string }>();
    mocks.reorder.mockReturnValue(pending.promise);
    showList();
    try {
      drag(firstTitle, secondTitle);
      await waitFor(() => expect(mocks.reorder).toHaveBeenCalledOnce());
      drag(secondTitle, firstTitle);
      expect(mocks.reorder).toHaveBeenCalledOnce();
    } finally { await act(async () => pending.resolve({ success: true, message: "순서를 저장했습니다." })); }
    expect(titles()).toEqual([secondTitle, firstTitle]);
  });
});
