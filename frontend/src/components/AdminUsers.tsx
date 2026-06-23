import { useEffect, useState } from "react";
import { api, type User } from "../api";
import { DomainsCard } from "./Settings";

function statusLabel(status: string): string {
  if (status === "active") return "Aktiv";
  if (status === "pending") return "Wartet";
  if (status === "disabled") return "Deaktiviert";
  return status;
}

function UserRow({
  user,
  onUpdated,
}: {
  user: User;
  onUpdated: (updated: User) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [selfMsg, setSelfMsg] = useState(false);
  const [err, setErr] = useState("");

  async function patch(body: { status?: string; role?: "admin" | "member" }) {
    if (busy) return;
    setBusy(true);
    setErr("");
    setSelfMsg(false);
    try {
      const result = await api.updateUser(user.id, body);
      if (result.error === "cannot_modify_self") {
        setSelfMsg(true);
      } else if (result.user) {
        onUpdated(result.user);
      }
    } catch (e: any) {
      setErr(e.message ?? "Fehler.");
    } finally {
      setBusy(false);
    }
  }

  const isPending = user.status === "pending";
  const isDisabled = user.status === "disabled";
  const isActive = user.status === "active";
  const count = user.uploadCount ?? 0;

  return (
    <li className="admin-user-row">
      <div className="admin-user-info">
        <span className="admin-user-email">{user.email}</span>
        <span
          className={`admin-folder-status ${
            isActive ? "status-active" : isPending ? "status-pending" : "status-disabled"
          }`}
        >
          {statusLabel(user.status)}
        </span>
        <span className={`role-pill role-pill--${user.role}`}>
          {user.role === "admin" ? "Admin" : "Mitglied"}
        </span>
        <span className="upload-count">{count} {count === 1 ? "Foto" : "Fotos"}</span>
      </div>
      <div className="admin-folder-actions">
        {isPending && (
          <button className="btn-approve" style={{ width: "auto", margin: 0 }} onClick={() => patch({ status: "active" })} disabled={busy}>
            Freischalten
          </button>
        )}
        {isActive && (
          <button className="btn-reject" style={{ width: "auto", margin: 0 }} onClick={() => patch({ status: "disabled" })} disabled={busy}>
            Deaktivieren
          </button>
        )}
        {isDisabled && (
          <button className="btn-approve" style={{ width: "auto", margin: 0 }} onClick={() => patch({ status: "active" })} disabled={busy}>
            Wieder aktivieren
          </button>
        )}
        {user.role === "member" && (
          <button className="btn-secondary" style={{ width: "auto", margin: 0 }} onClick={() => patch({ role: "admin" })} disabled={busy}>
            → Admin
          </button>
        )}
        {user.role === "admin" && (
          <button className="btn-secondary" style={{ width: "auto", margin: 0 }} onClick={() => patch({ role: "member" })} disabled={busy}>
            → Mitglied
          </button>
        )}
      </div>
      {selfMsg && <p className="err" style={{ margin: ".25rem 0 0" }}>Eigenen Account kann man nicht ändern.</p>}
      {err && <p className="err" style={{ margin: ".25rem 0 0" }}>{err}</p>}
    </li>
  );
}

function UserSection({
  title,
  hint,
  users,
  onUpdated,
  emptyText,
  variant,
}: {
  title: string;
  hint?: string;
  users: User[];
  onUpdated: (u: User) => void;
  emptyText: string;
  variant: "pending" | "admins" | "members";
}) {
  return (
    <section className={`user-section user-section--${variant}`}>
      <header className="user-section-head">
        <h3 className="user-section-title">
          {title} <span className="user-section-count">{users.length}</span>
        </h3>
        {hint && <p className="muted" style={{ margin: ".15rem 0 0" }}>{hint}</p>}
      </header>
      {users.length === 0 ? (
        <p className="muted user-section-empty">{emptyText}</p>
      ) : (
        <ul className="admin-folder-list">
          {users.map((u) => (
            <UserRow key={u.id} user={u} onUpdated={onUpdated} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ email: "", role: "member" as "admin" | "member" });
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState("");

  useEffect(() => {
    api
      .getUsers()
      .then((u) => {
        setUsers(u);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  function handleUpdated(updated: User) {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...updated, uploadCount: u.uploadCount } : u)));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.email.includes("@") || addBusy) return;
    setAddBusy(true);
    setAddErr("");
    try {
      const user = await api.createUser({ email: addForm.email.trim(), role: addForm.role });
      setUsers((prev) => {
        const exists = prev.find((u) => u.id === user.id);
        return exists ? prev.map((u) => (u.id === user.id ? user : u)) : [...prev, user];
      });
      setAddForm({ email: "", role: "member" });
      setShowAdd(false);
    } catch (e: any) {
      setAddErr(e.message ?? "Fehler beim Anlegen.");
    } finally {
      setAddBusy(false);
    }
  }

  if (loading) return <p className="muted">Lädt Nutzerliste …</p>;
  if (error) return <p className="err">Nutzerliste konnte nicht geladen werden.</p>;

  const pending = users.filter((u) => u.status === "pending");
  const admins = users.filter((u) => u.status !== "pending" && u.role === "admin");
  const members = users.filter((u) => u.status !== "pending" && u.role === "member");

  return (
    <div className="admin-section">
      <div className="page-head">
        <p className="page-kicker">Verwaltung</p>
        <h1 className="page-title">Nutzer</h1>
      </div>

      <div className="admin-section-header">
        <p className="muted" style={{ margin: 0 }}>
          {users.length} {users.length === 1 ? "Konto" : "Konten"} insgesamt
        </p>
        <button style={{ width: "auto", margin: 0 }} onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? "Abbrechen" : "+ Nutzer einladen"}
        </button>
      </div>

      {showAdd && (
        <div className="card" style={{ maxWidth: "none", margin: "1rem 0" }}>
          <h3 style={{ margin: "0 0 .75rem", color: "#5b3fb0" }}>Nutzer einladen / freischalten</h3>
          <p className="muted">Existiert die E-Mail bereits, wird der Account auf aktiv gesetzt.</p>
          <form onSubmit={handleAdd}>
            <input
              type="email"
              value={addForm.email}
              onChange={(e) => setAddForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="name@schule.de"
              required
              autoFocus
            />
            <select
              value={addForm.role}
              onChange={(e) => setAddForm((p) => ({ ...p, role: e.target.value as "admin" | "member" }))}
              style={{
                font: "inherit",
                width: "100%",
                padding: ".8rem 1rem",
                borderRadius: "12px",
                border: "1px solid #d9d3ef",
                marginTop: ".6rem",
                background: "#fff",
                color: "#1f1b2e",
              }}
            >
              <option value="member">Mitglied</option>
              <option value="admin">Admin</option>
            </select>
            {addErr && <p className="err">{addErr}</p>}
            <div style={{ display: "flex", gap: ".75rem", marginTop: "1rem" }}>
              <button
                type="submit"
                style={{ width: "auto" }}
                disabled={addBusy || !addForm.email.includes("@")}
              >
                {addBusy ? "Einladen …" : "Einladen"}
              </button>
            </div>
          </form>
        </div>
      )}

      {!users.length ? (
        <p className="muted">Noch keine Nutzer vorhanden.</p>
      ) : (
        <div className="user-sections">
          <UserSection
            title="Wartet auf Freischaltung"
            hint="Diese Adressen haben sich angemeldet und warten auf deine Freischaltung."
            users={pending}
            onUpdated={handleUpdated}
            emptyText="Keine offenen Anfragen."
            variant="pending"
          />
          <UserSection
            title="Lehrerinnen / Admins"
            users={admins}
            onUpdated={handleUpdated}
            emptyText="Noch keine Admins."
            variant="admins"
          />
          <UserSection
            title="Mitglieder"
            users={members}
            onUpdated={handleUpdated}
            emptyText="Noch keine Mitglieder."
            variant="members"
          />
        </div>
      )}

      <div className="settings-page" style={{ marginTop: "2rem" }}>
        <DomainsCard />
      </div>
    </div>
  );
}
