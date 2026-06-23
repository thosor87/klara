import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { api, type Me } from "../api";
import { TopBar } from "./TopBar";
import { NavBar } from "./NavBar";

export function Layout({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (me.role !== "admin") return;
    function refresh() {
      api.getPending().then((items) => setPendingCount(items.length)).catch(() => {});
    }
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [me.role]);

  return (
    <div className="app">
      <TopBar email={me.email} onLogout={onLogout} />
      <NavBar role={me.role} pendingCount={pendingCount} />
      <main className="app-content">
        <Outlet context={{ refreshPending: () => api.getPending().then((i) => setPendingCount(i.length)).catch(() => {}) }} />
      </main>
    </div>
  );
}
