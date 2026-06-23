import { Link } from "react-router-dom";

export function TopBar({ email, onLogout }: { email: string; onLogout: () => void }) {
  return (
    <header className="topbar">
      <Link to="/" className="topbar-brand" aria-label="Zur Startseite">
        <span className="topbar-mark" aria-hidden="true" />
        KlaRa
      </Link>
      <div className="topbar-right">
        <span className="topbar-email">{email}</span>
        <button className="btn-ghost" onClick={onLogout}>Abmelden</button>
      </div>
    </header>
  );
}
