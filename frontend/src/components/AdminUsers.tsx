import { useEffect, useState } from "react";
import { api, type User, type ClassOption } from "../api";
import { DomainsCard } from "./Settings";
import { AuditLog } from "./AuditLog";

function statusLabel(status: string): string {
  if (status === "active") return "Aktiv";
  if (status === "pending") return "Wartet";
  if (status === "disabled") return "Deaktiviert";
  return status;
}

/** Classes a user may be newly assigned to (active/alumni/legacy), plus their current one. */
function assignableClasses(classOptions: ClassOption[], currentId?: string | null): ClassOption[] {
  return classOptions.filter(
    (c) =>
      c.status === "active" || c.status === "alumni" || c.status === "legacy" || c.id === currentId,
  );
}

function UserRow({
  user,
  classOptions,
  onUpdated,
  selected,
  onToggleSelect,
}: {
  user: User;
  classOptions: ClassOption[];
  onUpdated: (updated: User) => void;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [editingClass, setEditingClass] = useState(false);
  const [selfMsg, setSelfMsg] = useState(false);
  const [err, setErr] = useState("");

  async function patch(body: { status?: string; role?: "admin" | "member"; classId?: string | null }) {
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
  const className = user.classId
    ? classOptions.find((c) => c.id === user.classId)?.label ?? "Klasse"
    : null;

  return (
    <li className="user-row">
      <label className="user-row-check" title="Auswählen">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(user.id)}
          aria-label={`${user.email} auswählen`}
        />
      </label>

      <span className="user-row-email">{user.email}</span>

      <span
        className={`status-pill ${
          isActive ? "status-active" : isPending ? "status-pending" : "status-disabled"
        }`}
      >
        {statusLabel(user.status)}
      </span>
      <span className={`role-pill role-pill--${user.role}`}>
        {user.role === "admin" ? "Admin" : "Mitglied"}
      </span>

      {/* Class: shown as a compact chip; click to change inline (rare action). */}
      {editingClass ? (
        <select
          className="user-class-inline"
          value={user.classId ?? ""}
          disabled={busy}
          autoFocus
          onBlur={() => setEditingClass(false)}
          onChange={(e) => {
            patch({ classId: e.target.value || null });
            setEditingClass(false);
          }}
        >
          <option value="">— keine Klasse —</option>
          {assignableClasses(classOptions, user.classId).map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      ) : (
        <button
          type="button"
          className={`user-class-chip${className ? "" : " user-class-chip--empty"}`}
          onClick={() => setEditingClass(true)}
          disabled={busy}
          title="Klasse ändern"
        >
          {className ?? "+ Klasse"}
        </button>
      )}

      <span className="user-row-uploads">{count} {count === 1 ? "Foto" : "Fotos"}</span>

      <span className="user-row-actions">
        {isPending && (
          <button className="btn-xs btn-xs--primary" onClick={() => patch({ status: "active" })} disabled={busy}>
            Freischalten
          </button>
        )}
        {isActive && (
          <button className="btn-xs btn-xs--danger" onClick={() => patch({ status: "disabled" })} disabled={busy}>
            Deaktivieren
          </button>
        )}
        {isDisabled && (
          <button className="btn-xs btn-xs--primary" onClick={() => patch({ status: "active" })} disabled={busy}>
            Aktivieren
          </button>
        )}
        {user.role === "member" ? (
          <button className="btn-xs" onClick={() => patch({ role: "admin" })} disabled={busy}>→ Admin</button>
        ) : (
          <button className="btn-xs" onClick={() => patch({ role: "member" })} disabled={busy}>→ Mitglied</button>
        )}
      </span>

      {selfMsg && <p className="err user-row-msg">Eigenen Account kann man nicht ändern.</p>}
      {err && <p className="err user-row-msg">{err}</p>}
    </li>
  );
}

function UserSection({
  title,
  hint,
  users,
  classOptions,
  onUpdated,
  emptyText,
  variant,
}: {
  title: string;
  hint?: string;
  users: User[];
  classOptions: ClassOption[];
  onUpdated: (u: User) => void;
  emptyText: string;
  variant: "pending" | "admins" | "members";
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkClass, setBulkClass] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkErr, setBulkErr] = useState("");

  // Drop ids from the selection that are no longer in this section (e.g. role changed).
  useEffect(() => {
    setSelected((prev) => {
      const present = new Set(users.map((u) => u.id));
      const next = new Set([...prev].filter((id) => present.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [users]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const allSelected = users.length > 0 && selected.size === users.length;
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(users.map((u) => u.id)));
  }

  async function doAssign() {
    if (!selected.size || bulkBusy) return;
    setBulkBusy(true);
    setBulkErr("");
    try {
      const updated = await api.assignClass([...selected], bulkClass || null);
      updated.forEach(onUpdated);
      setSelected(new Set());
    } catch (e: any) {
      setBulkErr(e.message ?? "Zuweisung fehlgeschlagen.");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <section className={`user-section user-section--${variant}`}>
      <header className="user-section-head">
        <h3 className="user-section-title">
          {title} <span className="user-section-count">{users.length}</span>
        </h3>
        {hint && <p className="muted" style={{ margin: ".15rem 0 0" }}>{hint}</p>}
      </header>

      {selected.size > 0 && (
        <div className="user-bulk-bar">
          <strong className="user-bulk-count">{selected.size} ausgewählt</strong>
          <button type="button" className="user-bulk-link" onClick={() => setSelected(new Set())}>
            Auswahl aufheben
          </button>
          <span className="user-bulk-spacer" />
          <label className="user-bulk-assign">
            <span>Klasse zuweisen:</span>
            <select className="user-bulk-select" value={bulkClass} onChange={(e) => setBulkClass(e.target.value)} disabled={bulkBusy}>
              <option value="">— keine —</option>
              {assignableClasses(classOptions).map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn-xs btn-xs--primary user-bulk-go" onClick={doAssign} disabled={bulkBusy}>
            {bulkBusy ? "Weise zu …" : "Zuweisen"}
          </button>
        </div>
      )}
      {bulkErr && <p className="err" style={{ margin: ".25rem 0 .5rem" }}>{bulkErr}</p>}

      {users.length === 0 ? (
        <p className="muted user-section-empty">{emptyText}</p>
      ) : (
        <>
          <div className="user-list-head">
            <label className="user-row-check" title="Alle auswählen">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Alle auswählen" />
            </label>
            <span className="user-list-head-label">Alle auswählen</span>
          </div>
          <ul className="user-list">
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                classOptions={classOptions}
                onUpdated={onUpdated}
                selected={selected.has(u.id)}
                onToggleSelect={toggle}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ email: "", role: "member" as "admin" | "member", classId: "" });
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState("");

  useEffect(() => {
    Promise.all([api.getUsers(), api.getClassOptions()])
      .then(([u, c]) => {
        setUsers(u);
        setClassOptions(c);
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
      const user = await api.createUser({
        email: addForm.email.trim(),
        role: addForm.role,
        classId: addForm.classId || null,
      });
      setUsers((prev) => {
        const exists = prev.find((u) => u.id === user.id);
        return exists ? prev.map((u) => (u.id === user.id ? user : u)) : [...prev, user];
      });
      setAddForm({ email: "", role: "member", classId: "" });
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
            <select
              value={addForm.classId}
              onChange={(e) => setAddForm((p) => ({ ...p, classId: e.target.value }))}
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
              <option value="">Klasse: — keine —</option>
              {assignableClasses(classOptions).map((c) => (
                <option key={c.id} value={c.id}>Klasse: {c.label}</option>
              ))}
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
            hint="Diese Adressen haben sich angemeldet und warten auf deine Freischaltung. Du kannst gleich eine Klasse zuweisen."
            users={pending}
            classOptions={classOptions}
            onUpdated={handleUpdated}
            emptyText="Keine offenen Anfragen."
            variant="pending"
          />
          <UserSection
            title="Lehrkräfte / Admins"
            users={admins}
            classOptions={classOptions}
            onUpdated={handleUpdated}
            emptyText="Noch keine Admins."
            variant="admins"
          />
          <UserSection
            title="Mitglieder"
            users={members}
            classOptions={classOptions}
            onUpdated={handleUpdated}
            emptyText="Noch keine Mitglieder."
            variant="members"
          />
        </div>
      )}

      <div className="settings-page" style={{ marginTop: "2rem" }}>
        <DomainsCard />
      </div>

      <AuditLog />
    </div>
  );
}
