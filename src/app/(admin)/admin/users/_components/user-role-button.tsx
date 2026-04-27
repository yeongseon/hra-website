"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updateUserRole } from "@/features/users/actions";

type UserRoleButtonProps = {
  userId: string;
  currentRole: "ADMIN" | "MEMBER";
};

export function UserRoleButton({ userId, currentRole }: UserRoleButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const targetRole = currentRole === "ADMIN" ? "MEMBER" : "ADMIN";
  const targetLabel = targetRole === "ADMIN" ? "관리자로 변경" : "멤버로 변경";

  const handleClick = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await updateUserRole(userId, targetRole);
      if (!result.success) {
        setMessage(result.message);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={isPending}
        className="text-xs"
      >
        {isPending ? "변경 중..." : targetLabel}
      </Button>
      {message && (
        <p className="text-xs text-red-500">{message}</p>
      )}
    </div>
  );
}
