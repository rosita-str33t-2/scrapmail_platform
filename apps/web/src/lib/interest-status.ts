/** Instantly's lead statuses (null = plain "Lead", no status). */
export const INTEREST_STATUS: {
  value: number;
  label: string;
  tone: "success" | "info" | "warning" | "danger" | "neutral";
}[] = [
  { value: 1, label: "Interested", tone: "success" },
  { value: 2, label: "Meeting booked", tone: "success" },
  { value: 3, label: "Meeting completed", tone: "info" },
  { value: 4, label: "Won", tone: "success" },
  { value: 0, label: "Out of office", tone: "neutral" },
  { value: -1, label: "Not interested", tone: "danger" },
  { value: -2, label: "Wrong person", tone: "warning" },
  { value: -3, label: "Lost", tone: "danger" },
  { value: -4, label: "No show", tone: "warning" },
];

export function interestStatus(value: number | null | undefined) {
  return value == null
    ? undefined
    : INTEREST_STATUS.find((s) => s.value === value);
}
