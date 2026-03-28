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

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as "PENDING" | "ACCEPTED" | "REJECTED";
    if (newStatus === currentStatus) return;

    setMessage(null);
    startTransition(async () => {
      const result = await updateApplicationStatus(applicationId, newStatus);
      if (!result.success) {
        setMessage(result.message);
      }
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <select
        defaultValue={currentStatus}
        onChange={handleChange}
        disabled={isPending}
        className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
      >
        {statusOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {isPending && <p className="text-xs text-slate-400">변경 중...</p>}
      {message && <p className="text-xs text-red-500">{message}</p>}
    </div>
  );
}
