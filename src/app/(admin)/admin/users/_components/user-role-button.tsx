"use client";

/**
 * 회원 그룹 변경 버튼 컴포넌트
 *
 * 관리자, 교수, 기수별 멤버, 승인 대기를 하나의 드롭다운으로 선택합니다.
 * - ADMIN / FACULTY / PENDING: 고정 역할
 * - 기수 UUID: MEMBER 역할 + cohortId 배정
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteUser, updateUserGroup } from "@/features/users/actions";

type Props = {
  userId: string;
  currentRole: "ADMIN" | "FACULTY" | "MEMBER" | "PENDING";
  currentCohortId: string | null;
  cohorts: { id: string; name: string }[];
};

// 드롭다운 현재 값 계산: MEMBER면 cohortId, 아니면 role 자체
function toGroupValue(
  role: "ADMIN" | "FACULTY" | "MEMBER" | "PENDING",
  cohortId: string | null
): string {
  if (role === "MEMBER" && cohortId) return cohortId;
  return role;
}

export function UserGroupButton({ userId, currentRole, currentCohortId, cohorts }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [groupValue, setGroupValue] = useState(() => toGroupValue(currentRole, currentCohortId));
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleGroupChange = (next: string | null) => {
    if (!next || next === groupValue) return;
    setMessage(null);
    startTransition(async () => {
      const result = await updateUserGroup(userId, next);
      if (!result.success) {
        setMessage(result.message);
        return;
      }
      setGroupValue(next);
      router.refresh();
    });
  };

  const handleDelete = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await deleteUser(userId);
      if (!result.success) {
        setMessage(result.message);
        return;
      }
      setIsDeleteOpen(false);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Select value={groupValue} onValueChange={handleGroupChange} disabled={isPending}>
          <SelectTrigger className="h-8 w-[148px] text-slate-900">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {/* 고정 역할 그룹 */}
            <SelectGroup>
              <SelectLabel className="text-xs text-slate-400">역할</SelectLabel>
              <SelectItem value="ADMIN">관리자</SelectItem>
              <SelectItem value="FACULTY">교수</SelectItem>
              <SelectItem value="PENDING">승인 대기</SelectItem>
            </SelectGroup>

            {/* 기수별 멤버 그룹 (기수가 하나 이상 있을 때만 표시) */}
            {cohorts.length > 0 && (
              <SelectGroup>
                <SelectLabel className="text-xs text-slate-400">기수 멤버</SelectLabel>
                {cohorts.map((cohort) => (
                  <SelectItem key={cohort.id} value={cohort.id}>
                    {cohort.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>

        <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <AlertDialogTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
              />
            }
          >
            <Trash2 className="size-3.5" />
            삭제
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>정말 삭제하시겠습니까?</AlertDialogTitle>
              <AlertDialogDescription>
                삭제한 회원 정보는 복구할 수 없습니다. 계속 진행하려면 삭제를 눌러주세요.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel render={<Button variant="outline" />}>
                취소
              </AlertDialogCancel>
              <AlertDialogAction
                render={
                  <Button
                    variant="outline"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    disabled={isPending}
                  />
                }
                onClick={handleDelete}
              >
                {isPending ? "삭제 중..." : "삭제"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {message && <p className="text-xs text-red-600">{message}</p>}
    </div>
  );
}

// 기존 이름으로도 import 가능하도록 alias export 유지
export { UserGroupButton as UserRoleButton };
