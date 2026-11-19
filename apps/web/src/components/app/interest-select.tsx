"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { DropdownSelect } from "@/components/ui/dropdown-select";
import { INTEREST_STATUS } from "@/lib/interest-status";
import { setLeadInterest } from "@/lib/reply-actions";

const DOT: Record<string, string> = {
  success: "bg-success",
  info: "bg-info",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-neutral",
};

/** The lead's status (Interested, Not interested, …), changed here and in Instantly. */
export function InterestSelect({
  replyId,
  status,
}: {
  replyId: string;
  status: number | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(status === null ? "" : String(status));
  const [pending, startTransition] = useTransition();

  const change = (next: string) => {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const result = await setLeadInterest(
        replyId,
        next === "" ? null : Number(next),
      );
      if (!result.ok) {
        setValue(previous);
        toast.error(result.error);
        return;
      }
      toast.success("Lead status updated");
      router.refresh();
    });
  };

  return (
    <DropdownSelect
      label="Lead status"
      value={value}
      onValueChange={change}
      disabled={pending}
      size="sm"
      className="w-48"
      options={[
        {
          value: "",
          label: "Lead (no status)",
          icon: <span className="size-2 rounded-full bg-muted-foreground/40" />,
        },
        ...INTEREST_STATUS.map((s) => ({
          value: String(s.value),
          label: s.label,
          icon: <span className={`size-2 rounded-full ${DOT[s.tone]}`} />,
        })),
      ]}
    />
  );
}
