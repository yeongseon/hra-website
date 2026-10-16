"use client";

// 언론보도 드래그앤드롭 목록 컴포넌트 (관리자 전용)
// HTML5 Drag and Drop API를 사용하여 언론보도 표시 순서를 변경합니다.
// 드롭 시 reorderPressArticles 서버 액션을 호출해 DB에 순서를 저장합니다.

import { useRef, useState, useTransition } from "react";
import { formatKstDate as formatDate } from "@/lib/date-time";
import Link from "next/link";
import { AlertCircle, GripVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deletePressArticle, reorderPressArticles } from "@/features/press/actions";
import { cn } from "@/lib/utils";

type PressArticleRow = {
  id: string;
  title: string;
  source: string;
  publishedAt: Date;
};

type Props = {
  initialItems: PressArticleRow[];
};

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}


export function PressSortableList({ initialItems }: Props) {
  const [items, setItems] = useState(initialItems);
  // ref: 드롭 핸들러에서 동기적으로 읽기 위한 드래그 인덱스
  const draggingIdxRef = useRef<number | null>(null);
  // state: 드래그 중인 행에 opacity 효과를 주기 위한 시각 전용 인덱스
  const [draggingVisualIdx, setDraggingVisualIdx] = useState<number | null>(null);
  // 드래그 커서가 위에 올라와 있는 항목의 인덱스 (드롭 대상 강조용)
  const [overIdx, setOverIdx] = useState<number | null>(null);
  // 서버 저장 상태
  const [isPending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // 같은 렌더 안의 연속 클릭도 막고, 삭제와 순서 저장이 서로의 목록 상태를 덮지 않게 합니다.
  const operationRef = useRef(false);
  const isBusy = isPending || deletingId !== null;

  // 드래그 시작 — ref(드롭 로직용) + state(시각 효과용) 모두 갱신
  const handleDragStart = (e: React.DragEvent<HTMLTableRowElement>, idx: number) => {
    if (operationRef.current || isBusy) {
      e.preventDefault();
      return;
    }
    draggingIdxRef.current = idx;
    setDraggingVisualIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  };

  // 드래그 중 타겟 위 이동 — 브라우저 기본 금지 동작 해제 + 강조 인덱스 갱신
  const handleDragOver = (e: React.DragEvent<HTMLTableRowElement>, idx: number) => {
    if (operationRef.current || isBusy) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggingIdxRef.current !== null && draggingIdxRef.current !== idx) {
      setOverIdx(idx);
    }
  };

  // 드래그 종료 (드롭 없이 취소 포함)
  const handleDragEnd = () => {
    draggingIdxRef.current = null;
    setDraggingVisualIdx(null);
    setOverIdx(null);
  };

  // 드롭 — 항목 위치를 변경하고 서버에 저장
  const handleDrop = (e: React.DragEvent<HTMLTableRowElement>, dropIdx: number) => {
    e.preventDefault();
    if (operationRef.current || isBusy) return;
    const fromIdx = draggingIdxRef.current;

    draggingIdxRef.current = null;
    setDraggingVisualIdx(null);
    setOverIdx(null);

    // 같은 위치에 드롭하면 변경 없음
    if (fromIdx === null || fromIdx === dropIdx) return;

    // 처리 중에는 다음 변경을 막아 실패 복원이 이후 요청의 결과를 덮지 않게 합니다.
    operationRef.current = true;
    // 낙관적 UI: 먼저 로컬 상태 갱신
    const prev = items;
    const next = [...items];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(dropIdx, 0, moved);
    setItems(next);

    setSaveError(null);
    startTransition(async () => {
      try {
        const result = await reorderPressArticles(next.map((i) => i.id));
        if (!result.success) {
          setSaveError(result.message);
          setItems(prev);
        }
      } catch {
        // 통신 실패도 서버의 명시적 실패와 같이 복원하고 내부 오류 원문은 표시하지 않습니다.
        setSaveError("순서 저장 중 오류가 발생했습니다. 다시 시도해주세요.");
        setItems(prev);
      } finally {
        operationRef.current = false;
      }
    });
  };

  // 서버에서 삭제를 확인한 뒤 행을 제거하여 실패 시 표시 행과 재시도를 보존합니다.
  const handleDelete = async (id: string) => {
    if (operationRef.current || isBusy || !confirm("정말 삭제하시겠습니까?")) return;
    operationRef.current = true;
    setDeletingId(id);
    setSaveError(null);
    try {
      await deletePressArticle(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setSaveError("삭제 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      operationRef.current = false;
      setDeletingId(null);
    }
  };

  return (
    <Card aria-busy={isBusy} className="border-[#D9D9D9] bg-white py-0 shadow-sm">
      <CardHeader className="border-b border-[#D9D9D9] py-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base text-[#1a1a1a]">전체 언론보도 {items.length}건</CardTitle>
          {isBusy && (
            <span className="text-xs text-[#666666]">{deletingId ? "삭제 중..." : "순서 저장 중..."}</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="py-4">
        {saveError && (
          <div role="alert" className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            <AlertCircle className="size-4 shrink-0" />
            {saveError}
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {/* 드래그 핸들 열 */}
                <TableHead className="w-10" />
                <TableHead className="w-10 text-center">순서</TableHead>
                <TableHead>제목</TableHead>
                <TableHead>언론사</TableHead>
                <TableHead>게시일</TableHead>
                <TableHead className="w-32 shrink-0 text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-[#666666]">
                    등록된 언론보도가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item, idx) => (
                  <TableRow
                    key={item.id}
                    draggable={!isBusy}
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, idx)}
                    className={cn(
                      "transition-colors",
                      // 드래그 중인 행: 반투명
                      draggingVisualIdx === idx && "opacity-40",
                      // 드롭 대상 행: 파란색 배경 강조
                      overIdx === idx && "bg-blue-50 outline outline-2 -outline-offset-1 outline-blue-300"
                    )}
                  >
                    {/* 드래그 핸들 */}
                    <TableCell className="cursor-grab px-2 text-[#D9D9D9] active:cursor-grabbing">
                      <GripVertical className="size-4" />
                    </TableCell>
                    {/* 현재 배열 위치 기반 순서 번호 */}
                    <TableCell className="text-center text-[#666666]">{idx + 1}</TableCell>
                    <TableCell className="max-w-sm font-medium text-[#1a1a1a]">
                      {truncate(item.title, 70)}
                    </TableCell>
                    <TableCell className="text-[#1a1a1a]">{truncate(item.source, 30)}</TableCell>
                    <TableCell className="text-[#666666]">{formatDate(item.publishedAt)}</TableCell>
                    <TableCell className="w-32 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          render={<Link href={`/admin/press/${item.id}`} />}
                        >
                          수정
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={isBusy}
                          onClick={() => handleDelete(item.id)}
                        >
                          <Trash2 className="size-3.5" />
                          삭제
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
