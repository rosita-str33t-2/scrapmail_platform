import { StatusBadge } from "@/components/app/status-badge";

/** Export level of an email: 0 = never exported, then +1 per export. */
export function LevelBadge({ level }: { level: number }) {
  return (
    <StatusBadge
      tone={level === 0 ? "success" : level === 1 ? "warning" : "danger"}
      dot={false}
      className="min-w-7 justify-center tabular-nums"
    >
      {level}
    </StatusBadge>
  );
}
