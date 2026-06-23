import { NavLink } from "react-router-dom";

export function NavBar({ role, pendingCount }: {
  role: "admin" | "member";
  pendingCount: number;
}) {
  const cls = ({ isActive }: { isActive: boolean }) =>
    `nav-item${isActive ? " active" : ""}`;

  return (
    <nav className="navbar" aria-label="Hauptnavigation">
      <NavLink to="/" end className={cls}>Alben</NavLink>
      {role === "admin" && (
        <NavLink to="/freigabe" className={cls}>
          Zu prüfen
          {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
        </NavLink>
      )}
      {role === "admin" && (
        <NavLink to="/verwaltung/ordner" className={cls}>Alben verwalten</NavLink>
      )}
      {role === "admin" && (
        <NavLink to="/verwaltung/nutzer" className={cls}>Nutzer</NavLink>
      )}
    </nav>
  );
}
