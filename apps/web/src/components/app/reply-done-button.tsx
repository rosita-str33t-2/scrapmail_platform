"use client";

import { Check, Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { setReplyHandled } from "@/lib/reply-actions";

/** "Done" for a reply that needs attention; "Reopen" for one that was done. */
export function ReplyDoneButton({ id, done }: { id: string; done: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  const toggle = () => {
    setFailed(false);
    startTransition(async () => {
      try {
        await setReplyHandled(id, !done);
        router.refresh();
      } catch {
        setFailed(true);
      }
    });
  };

  return (
    <Button
      type="button"
      size="sm"
      variant={done ? "ghost" : "outline"}
      onClick={toggle}
      disabled={pending}
      title={failed ? "That did not work. Please try again." : undefined}
      className={failed ? "border-destructive text-destructive" : undefined}
    >
      {pending ? (
        <Loader2 className="animate-spin" />
      ) : done ? (
        <RotateCcw />
      ) : (
        <Check />
      )}
      {done ? "Reopen" : "Done"}
    </Button>
  );
}
