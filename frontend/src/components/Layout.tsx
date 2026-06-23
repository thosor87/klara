import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { api, type Me } from "../api";
import { TopBar } from "./TopBar";
import { NavBar } from "./NavBar";

export function Layout({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [badgeCount, setBadgeCount] = useState(0);

  async function refreshBadge() {
    try {
      const [pending, reports] = await Promise.all([
        api.getPending(),
        api.getReports(),
      ]);
      const openReports = reports.filter((r) => r.status === "open").length;
      setBadgeCount(pending.length + openReports);
    } catch {
      // silently ignore errors — badge stays as-is
    }
  }

  useEffect(() => {
    if (me.role !== "admin") return;
    refreshBadge();
    const id = setInterval(refreshBadge, 30_000);
    return () => clearInterval(id);
  }, [me.role]);

  return (
    <div className="app">
      <TopBar email={me.email} onLogout={onLogout} />
      <NavBar role={me.role} pendingCount={badgeCount} />
      <main className="app-content">
        <Outlet context={{ refreshPending: refreshBadge }} />
      </main>
    </div>
  );
}
