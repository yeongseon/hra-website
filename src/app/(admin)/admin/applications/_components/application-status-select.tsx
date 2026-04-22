"use client";

import { useState, useTransition } from "react";
import { updateApplicationStatus } from "@/features/applications/actions/update-status";

type StatusSelectProps = {
  applicationId: string;
  currentStatus: "PENDING" | "ACCEPTED" | "REJECTED";
};

const statusOptions = [
  { value: "PENDING" as const, label: "대기" },
  { value: "ACCEPTED" as const, label: "합격" },
  { value: "REJECTED" as const, label: "불합격" },
];

export function ApplicationStatusSelect({ applicationId, currentStatus }: StatusSelectProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState(currentStatus);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as "PENDING" | "ACCEPTED" | "REJECTED";
    const previousStatus = selectedStatus;

    if (newStatus === previousStatus) {
      return;
    }

    // 사용자가 변경한 값을 먼저 반영하되, 저장 실패 시 원래 값으로 되돌립니다.
    setSelectedStatus(newStatus);
    setMessage(null);

    startTransition(async () => {
      const result = await updateApplicationStatus(applicationId, newStatus);

      if (!result.success) {
        setSelectedStatus(previousStatus);
        setMessage(result.message);
      }
    });
  };

  return (
    <div className="flex min-w-24 flex-col gap-1">
      <select
        value={selectedStatus}
        onChange={handleChange}
        disabled={isPending}
        className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
      >
        {statusOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {isPending ? <p className="text-xs text-slate-400">변경 중...</p> : null}
      {message ? <p className="text-xs text-red-500">{message}</p> : null}
    </div>
  );
}
