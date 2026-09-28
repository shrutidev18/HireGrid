import type { ApplicationStatus } from "../types";

// just a colored pill for the status - one color per status so it's
// easy to scan the list at a glance
const COLORS: Record<ApplicationStatus, string> = {
  SAVED: "bg-gray-100 text-gray-700",
  APPLIED: "bg-blue-100 text-blue-700",
  INTERVIEW: "bg-amber-100 text-amber-800",
  OFFER: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
};

export default function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${COLORS[status]}`}>
      {status}
    </span>
  );
}
