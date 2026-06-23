import { useEffect, useState } from "react";
import { api, type Folder } from "../api";

type EditState = { name: string; schoolYear: string; classLabel: string };

function FolderRow({
  folder,
  onUpdated,
}: {
  folder: Folder;
  onUpdated: (updated: Folder) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditState>({
    name: folder.name,
    schoolYear: folder.schoolYear ?? "",
    classLabel: folder.classLabel ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || busy) return;
    setBusy(true);
    setErr("");
    try {
      const updated = await api.updateFolder(folder.id, {
        name: form.name.trim(),
        schoolYear: form.schoolYear.trim() || undefined,
        classLabel: form.classLabel.trim() || undefined,
      });
      onUpdated(updated);
      setEditing(false);
    } catch (e: any) {
      setErr(e.message ?? "Fehler beim Speichern.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled() {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const updated = await api.updateFolder(folder.id, { enabled: !folder.enabled });
      onUpdated(updated);
    } catch (e: any) {
      setErr(e.message ?? "Fehler beim Umschalten.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="admin-folder-row admin-folder-row--editing">
        <form onSubmit={saveEdit} className="admin-folder-edit-form">
          <input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Name"
            required
            autoFocus
          />
          <input
            value={form.schoolYear}
            onChange={(e) => setForm((p) => ({ ...p, schoolYear: e.target.value }))}
            placeholder="Schuljahr (z.B. 2024/25)"
          />
          <input
            value={form.classLabel}
            onChange={(e) => setForm((p) => ({ ...p, classLabel: e.target.value }))}
            placeholder="Klasse (z.B. 2b)"
          />
          {err && <p className="err">{err}</p>}
          <div className="dialog-actions">
            <button type="button" className="btn-ghost-dark" onClick={() => setEditing(false)} disabled={busy}>
              Abbrechen
            </button>
            <button type="submit" disabled={busy || !form.name.trim()}>
              {busy ? "Speichert …" : "Speichern"}
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="admin-folder-row">
      <div className="admin-folder-info">
        <span className="admin-folder-name">{folder.name}</span>
        {(folder.schoolYear || folder.classLabel) && (
          <span className="muted admin-folder-meta">
            {[folder.schoolYear, folder.classLabel].filter(Boolean).join(" · ")}
          </span>
        )}
        <span className={`admin-folder-status ${folder.enabled ? "status-active" : "status-disabled"}`}>
          {folder.enabled ? "Aktiv" : "Deaktiviert"}
        </span>
        <span className="muted admin-folder-meta">{folder.itemCount} Fotos</span>
      </div>
      <div className="admin-folder-actions">
        <button className="btn-secondary" style={{ width: "auto", margin: 0 }} onClick={() => setEditing(true)}>
          Bearbeiten
        </button>
        <button
          className={folder.enabled ? "btn-reject" : "btn-approve"}
          style={{ width: "auto", margin: 0 }}
          onClick={toggleEnabled}
          disabled={busy}
        >
          {folder.enabled ? "Deaktivieren" : "Aktivieren"}
        </button>
      </div>
      {err && <p className="err">{err}</p>}
    </li>
  );
}

export function AdminFolders() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", schoolYear: "", classLabel: "" });
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState("");

  useEffect(() => {
    api
      .getFolders()
      .then((f) => {
        setFolders(f);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  function handleUpdated(updated: Folder) {
    setFolders((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.name.trim() || createBusy) return;
    setCreateBusy(true);
    setCreateErr("");
    try {
      const folder = await api.createFolder({
        name: createForm.name.trim(),
        schoolYear: createForm.schoolYear.trim() || undefined,
        classLabel: createForm.classLabel.trim() || undefined,
      });
      setFolders((prev) => [...prev, folder]);
      setCreateForm({ name: "", schoolYear: "", classLabel: "" });
      setShowCreate(false);
    } catch (e: any) {
      setCreateErr(e.message ?? "Fehler beim Anlegen.");
    } finally {
      setCreateBusy(false);
    }
  }

  if (loading) return <p className="muted">Lädt Ordner …</p>;
  if (error) return <p className="err">Ordner konnten nicht geladen werden.</p>;

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>Ordner verwalten</h2>
        <button style={{ width: "auto", margin: 0 }} onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Abbrechen" : "+ Neuer Ordner"}
        </button>
      </div>

      {showCreate && (
        <div className="card" style={{ maxWidth: "none", margin: "1rem 0" }}>
          <h3 style={{ margin: "0 0 .75rem", color: "#5b3fb0" }}>Neuen Ordner anlegen</h3>
          <form onSubmit={handleCreate}>
            <input
              value={createForm.name}
              onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Name (z.B. Klassenfahrt 2025)"
              required
              autoFocus
            />
            <input
              value={createForm.schoolYear}
              onChange={(e) => setCreateForm((p) => ({ ...p, schoolYear: e.target.value }))}
              placeholder="Schuljahr (z.B. 2024/25) — optional"
            />
            <input
              value={createForm.classLabel}
              onChange={(e) => setCreateForm((p) => ({ ...p, classLabel: e.target.value }))}
              placeholder="Klasse (z.B. 2b) — optional"
            />
            {createErr && <p className="err">{createErr}</p>}
            <div style={{ display: "flex", gap: ".75rem", marginTop: "1rem" }}>
              <button type="submit" style={{ width: "auto" }} disabled={createBusy || !createForm.name.trim()}>
                {createBusy ? "Anlegen …" : "Anlegen"}
              </button>
            </div>
          </form>
        </div>
      )}

      {!folders.length && <p className="muted">Noch keine Ordner vorhanden.</p>}

      <ul className="admin-folder-list">
        {folders.map((f) => (
          <FolderRow key={f.id} folder={f} onUpdated={handleUpdated} />
        ))}
      </ul>
    </div>
  );
}
