import { type View } from "../types";

export function NavBar({ role, view, onNav, pendingCount }: {
  role: "admin" | "member";
  view: View;
  onNav: (view: View) => void;
  pendingCount: number;
}) {
  return (
    <nav className="navbar">
      <button className={`nav-item${view === "folders" ? " active" : ""}`} onClick={() => onNav("folders")}>
        Ordner
      </button>
      {role === "admin" && (
        <button className={`nav-item${view === "approval" ? " active" : ""}`} onClick={() => onNav("approval")}>
          Freigabe
          {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
        </button>
      )}
      {role === "admin" && (
        <button className={`nav-item${view === "admin-folders" ? " active" : ""}`} onClick={() => onNav("admin-folders")}>
          Ordner verwalten
        </button>
      )}
      {role === "admin" && (
        <button className={`nav-item${view === "admin-users" ? " active" : ""}`} onClick={() => onNav("admin-users")}>
          Nutzer
        </button>
      )}
    </nav>
  );
}
