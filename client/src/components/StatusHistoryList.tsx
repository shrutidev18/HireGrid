import type { StatusHistoryEntry } from "../types";
import StatusBadge from "./StatusBadge";

// vertical timeline - a blue dot per status change, connected by a line
export default function StatusHistoryList({ history }: { history: StatusHistoryEntry[] }) {
  if (history.length === 0) {
    return <p className="text-sm text-gray-400">No status changes yet.</p>;
  }

  return (
    <ul>
      {history.map((entry, i) => (
        <li key={entry.id} className="flex gap-3 pb-4 last:pb-0">
          <div className="flex flex-col items-center">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-700 mt-1.5 shrink-0" />
            {i < history.length - 1 && <span className="w-px flex-1 bg-blue-100 mt-1" />}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <StatusBadge status={entry.status} />
            <span className="text-gray-500">{new Date(entry.changedAt).toLocaleString()}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
