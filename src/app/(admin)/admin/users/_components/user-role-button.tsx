"use client";

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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deleteUser, updateUserRole } from "@/features/users/actions";

type UserRole = "ADMIN" | "MEMBER" | "PENDING";

const roleOptions: Array<{ value: UserRole; label: string }> = [
  { value: "ADMIN", label: "관리자" },
  { value: "MEMBER", label: "멤버" },
  { value: "PENDING", label: "승인 대기" },
];

type UserRoleButtonProps = {
  userId: string;
  currentRole: UserRole;
};

export function UserRoleButton({ userId, currentRole }: UserRoleButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [role, setRole] = useState<UserRole>(currentRole);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleRoleChange = (nextRole: string | null) => {
    if (!nextRole || nextRole === role) {
      return;
    }

    setMessage(null);
    startTransition(async () => {
      const result = await updateUserRole(userId, nextRole as UserRole);
      if (!result.success) {
        setMessage(result.message);
        return;
      }

      setRole(nextRole as UserRole);
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
        <Select value={role} onValueChange={handleRoleChange} disabled={isPending}>
          <SelectTrigger className="h-8 w-[128px] text-slate-900">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roleOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
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
      {message && (
        <p className="text-xs text-red-600">{message}</p>
      )}
    </div>
  );
}
