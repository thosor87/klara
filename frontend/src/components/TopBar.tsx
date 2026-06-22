export function TopBar({ email, onLogout }: { email: string; onLogout: () => void }) {
  return (
    <header className="topbar">
      <span className="topbar-brand">KlaRa</span>
      <div className="topbar-right">
        <span className="topbar-email">{email}</span>
        <button className="btn-ghost" onClick={onLogout}>Abmelden</button>
      </div>
    </header>
  );
}
