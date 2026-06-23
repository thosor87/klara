import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { ApprovalQueue } from "./ApprovalQueue";
import { ReportsQueue } from "./ReportsQueue";

type Tab = "neu" | "meldungen";

/**
 * Combined moderation page: wraps the two existing queues (new photos awaiting
 * approval + reported photos) in a tabbed container. The active tab lives in the
 * URL (`?tab=meldungen`) so deep links and the back button work. Both child
 * queues keep their own behaviour and still read `refreshPending` from the
 * Layout outlet context.
 */
export function Moderation() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get("tab") === "meldungen" ? "meldungen" : "neu";

  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [reportCount, setReportCount] = useState<number | null>(null);

  // Tab header counts. Kept independent of the queues themselves so switching
  // tabs (or acting inside a queue) re-fetches fresh numbers.
  function loadCounts() {
    api.getPending()
      .then((p) => setPendingCount(p.length))
      .catch(() => setPendingCount(null));
    api.getReports()
      .then((rs) => setReportCount(rs.filter((r) => r.status === "open").length))
      .catch(() => setReportCount(null));
  }

  useEffect(() => { loadCounts(); }, [tab]);

  function selectTab(next: Tab) {
    const params = new URLSearchParams(searchParams);
    if (next === "meldungen") params.set("tab", "meldungen");
    else params.delete("tab");
    setSearchParams(params, { replace: true });
  }

  return (
    <div className="moderation">
      <div className="moderation-tabs" role="tablist" aria-label="Zu prüfen">
        <button
          role="tab"
          aria-selected={tab === "neu"}
          className={`moderation-tab${tab === "neu" ? " active" : ""}`}
          onClick={() => selectTab("neu")}
        >
          Neue Fotos
          {pendingCount !== null && pendingCount > 0 && (
            <span className="moderation-tab-count">{pendingCount}</span>
          )}
        </button>
        <button
          role="tab"
          aria-selected={tab === "meldungen"}
          className={`moderation-tab${tab === "meldungen" ? " active" : ""}`}
          onClick={() => selectTab("meldungen")}
        >
          Meldungen
          {reportCount !== null && reportCount > 0 && (
            <span className="moderation-tab-count">{reportCount}</span>
          )}
        </button>
      </div>

      <div className="moderation-panel" role="tabpanel">
        {tab === "neu" ? <ApprovalQueue /> : <ReportsQueue />}
      </div>
    </div>
  );
}
