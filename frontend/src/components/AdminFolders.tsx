import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Folder, type ClassOption, type Item } from "../api";
import { schoolYearOptions, formatDateRange } from "../dates";
import { Trash } from "./Trash";

type FormState = {
  name: string;
  schoolYear: string;
  classLabel: string;
  startDate: string;
  endDate: string;
};

const emptyForm: FormState = { name: "", schoolYear: "", classLabel: "", startDate: "", endDate: "" };

/** Shared fields used by both the create form and the inline edit form. */
function FolderFormFields({
  form,
  setForm,
  classOptions,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  classOptions: ClassOption[];
}) {
  const years = schoolYearOptions();
  return (
    <>
      <input
        value={form.name}
        onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
        placeholder="Name (z.B. Klassenfahrt 2025)"
        required
        autoFocus
      />
      <label className="form-field">
        <span className="form-label">Schuljahr</span>
        <select
          value={form.schoolYear}
          onChange={(e) => setForm((p) => ({ ...p, schoolYear: e.target.value }))}
        >
          <option value="">— kein Schuljahr —</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </label>
      <label className="form-field">
        <span className="form-label">
          Klasse
          <Link to="/verwaltung/klassen" className="form-label-link">Klassen verwalten</Link>
        </span>
        <select
          value={form.classLabel}
          onChange={(e) => setForm((p) => ({ ...p, classLabel: e.target.value }))}
        >
          <option value="">— keine Klasse —</option>
          {classOptions.map((c) => (
            <option key={c.id} value={c.label}>{c.label}</option>
          ))}
        </select>
      </label>
      <div className="form-row">
        <label className="form-field">
          <span className="form-label">Von</span>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
          />
        </label>
        <label className="form-field">
          <span className="form-label">Bis (optional)</span>
          <input
            type="date"
            value={form.endDate}
            min={form.startDate || undefined}
            onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
          />
        </label>
      </div>
    </>
  );
}

function FolderRow({
  folder,
  classOptions,
  isFirst,
  isLast,
  onUpdated,
  onMove,
  onPickCover,
}: {
  folder: Folder;
  classOptions: ClassOption[];
  isFirst: boolean;
  isLast: boolean;
  onUpdated: (updated: Folder) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onPickCover: (folder: Folder) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: folder.name,
    schoolYear: folder.schoolYear ?? "",
    classLabel: folder.classLabel ?? "",
    startDate: folder.startDate ?? "",
    endDate: folder.endDate ?? "",
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
        schoolYear: form.schoolYear || undefined,
        classLabel: form.classLabel || undefined,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
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
          <FolderFormFields form={form} setForm={setForm} classOptions={classOptions} />
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

  const range = formatDateRange(folder.startDate, folder.endDate);

  return (
    <li className="admin-folder-row">
      <div className="admin-folder-order">
        <button
          className="order-btn"
          aria-label="Nach oben"
          onClick={() => onMove(folder.id, "up")}
          disabled={isFirst}
        >▲</button>
        <button
          className="order-btn"
          aria-label="Nach unten"
          onClick={() => onMove(folder.id, "down")}
          disabled={isLast}
        >▼</button>
      </div>
      {folder.coverThumbUrl ? (
        <img className="admin-folder-cover" src={folder.coverThumbUrl} alt="" />
      ) : (
        <span className="admin-folder-cover admin-folder-cover--empty" aria-hidden="true">🌿</span>
      )}
      <div className="admin-folder-info">
        <span className="admin-folder-name">{folder.name}</span>
        {(folder.schoolYear || folder.classLabel) && (
          <span className="muted admin-folder-meta">
            {[folder.schoolYear, folder.classLabel].filter(Boolean).join(" · ")}
          </span>
        )}
        {range && <span className="muted admin-folder-meta">{range}</span>}
        <span className={`admin-folder-status ${folder.enabled ? "status-active" : "status-disabled"}`}>
          {folder.enabled ? "Aktiv" : "Deaktiviert"}
        </span>
        <span className="muted admin-folder-meta">{folder.itemCount} Fotos</span>
      </div>
      <div className="admin-folder-actions">
        <button className="btn-secondary" style={{ width: "auto", margin: 0 }} onClick={() => setEditing(true)}>
          Bearbeiten
        </button>
        <button className="btn-secondary" style={{ width: "auto", margin: 0 }} onClick={() => onPickCover(folder)}>
          Titelbild
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

/** Modal to pick a folder cover from its approved photos. */
function CoverPicker({
  folder,
  onClose,
  onChosen,
}: {
  folder: Folder;
  onClose: () => void;
  onChosen: (updated: Folder) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    api.getFolderItems(folder.id)
      .then((its) => { setItems(its.filter((i) => i.status === "approved")); setLoading(false); })
      .catch(() => { setErr("Fotos konnten nicht geladen werden."); setLoading(false); });
  }, [folder.id]);

  async function choose(coverItemId: string | null) {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const updated = await api.updateFolder(folder.id, { coverItemId });
      onChosen(updated);
      onClose();
    } catch (e: any) {
      setErr(e.message ?? "Titelbild konnte nicht gesetzt werden.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Titelbild wählen">
      <div className="dialog-card cover-picker">
        <h2>Titelbild wählen</h2>
        <p style={{ marginTop: ".3rem", color: "var(--ink-soft)", fontSize: ".9rem" }}>
          {folder.name} — wähle eines der freigegebenen Fotos.
        </p>
        {loading && <p className="muted">Lädt Fotos …</p>}
        {!loading && !items.length && (
          <p className="muted">Dieser Ordner hat noch keine freigegebenen Fotos.</p>
        )}
        {!loading && items.length > 0 && (
          <div className="cover-grid">
            {items.map((it) => (
              <button
                key={it.id}
                type="button"
                className={`cover-tile${folder.coverItemId === it.id ? " selected" : ""}`}
                onClick={() => choose(it.id)}
                disabled={busy}
                aria-label={it.caption || "Als Titelbild wählen"}
              >
                <img src={it.thumbUrl} alt={it.caption || "Foto"} loading="lazy" />
              </button>
            ))}
          </div>
        )}
        {err && <p className="err">{err}</p>}
        <div className="dialog-actions" style={{ marginTop: "1rem" }}>
          {folder.coverItemId && (
            <button type="button" className="btn-ghost-dark" onClick={() => choose(null)} disabled={busy}>
              Titelbild entfernen
            </button>
          )}
          <button type="button" className="btn-ghost-dark" onClick={onClose} disabled={busy}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminFolders() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<FormState>(emptyForm);
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState("");
  const [coverFor, setCoverFor] = useState<Folder | null>(null);

  function reload() {
    return api.getFolders().then((f) => setFolders(f));
  }

  useEffect(() => {
    Promise.all([api.getFolders(), api.getClassOptions()])
      .then(([f, c]) => {
        setFolders(f);
        setClassOptions(c);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  function handleUpdated(updated: Folder) {
    // The PATCH response may omit derived fields (coverThumbUrl/itemCount);
    // merge onto the existing row so the list stays consistent.
    setFolders((prev) => prev.map((f) => (f.id === updated.id ? { ...f, ...updated } : f)));
    // Reload to refresh coverThumbUrl after a cover change.
    reload().catch(() => {});
  }

  async function handleMove(id: string, direction: "up" | "down") {
    try {
      await api.moveFolder(id, direction);
      await reload();
    } catch {
      /* ignore — list stays as-is */
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.name.trim() || createBusy) return;
    setCreateBusy(true);
    setCreateErr("");
    try {
      await api.createFolder({
        name: createForm.name.trim(),
        schoolYear: createForm.schoolYear || undefined,
        classLabel: createForm.classLabel || undefined,
        startDate: createForm.startDate || null,
        endDate: createForm.endDate || null,
      });
      await reload();
      setCreateForm(emptyForm);
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
          <form onSubmit={handleCreate} className="admin-folder-edit-form">
            <FolderFormFields form={createForm} setForm={setCreateForm} classOptions={classOptions} />
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
        {folders.map((f, i) => (
          <FolderRow
            key={f.id}
            folder={f}
            classOptions={classOptions}
            isFirst={i === 0}
            isLast={i === folders.length - 1}
            onUpdated={handleUpdated}
            onMove={handleMove}
            onPickCover={setCoverFor}
          />
        ))}
      </ul>

      {coverFor && (
        <CoverPicker
          folder={coverFor}
          onClose={() => setCoverFor(null)}
          onChosen={handleUpdated}
        />
      )}

      <div className="admin-trash-section">
        <Trash />
      </div>
    </div>
  );
}
