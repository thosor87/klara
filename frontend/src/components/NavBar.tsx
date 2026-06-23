import { NavLink } from "react-router-dom";

export function NavBar({ role, pendingCount }: {
  role: "admin" | "member";
  pendingCount: number;
}) {
  const cls = ({ isActive }: { isActive: boolean }) =>
    `nav-item${isActive ? " active" : ""}`;

  return (
    <nav className="navbar" aria-label="Hauptnavigation">
      <NavLink to="/" end className={cls}>Ordner</NavLink>
      {role === "admin" && (
        <NavLink to="/freigabe" className={cls}>
          Freigabe
          {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
        </NavLink>
      )}
      {role === "admin" && (
        <NavLink to="/meldungen" className={cls}>Meldungen</NavLink>
      )}
      {role === "admin" && (
        <NavLink to="/papierkorb" className={cls}>Papierkorb</NavLink>
      )}
      {role === "admin" && (
        <NavLink to="/verwaltung/ordner" className={cls}>Ordner verwalten</NavLink>
      )}
      {role === "admin" && (
        <NavLink to="/verwaltung/nutzer" className={cls}>Nutzer</NavLink>
      )}
      {role === "admin" && (
        <NavLink to="/verwaltung/domains" className={cls}>Domains</NavLink>
      )}
      {role === "admin" && (
        <NavLink to="/verwaltung/klassen" className={cls}>Klassen</NavLink>
      )}
    </nav>
  );
}
