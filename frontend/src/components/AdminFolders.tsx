import { useEffect, useId, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { api, type Folder, type ClassOption, type Item, type Me } from "../api";
import { formatDateRange, toDateInput } from "../dates";
import { Trash } from "./Trash";

type OutletCtx = { me?: Me };

type FormState = {
  name: string;
  startDate: string;
  endDate: string;
  classIds: string[];
};

const emptyForm: FormState = { name: "", startDate: "", endDate: "", classIds: [] };

/** Chip label for a class in the picker — just the computed label (e.g. "Klasse 2m"). */
function chipLabel(c: ClassOption): string {
  return c.label;
}

/** Small chips showing the classes an album is assigned to (labels via class-options). */
function ClassChips({ classIds, classOptions }: { classIds: string[]; classOptions: ClassOption[] }) {
  if (!classIds.length) {
    return <span className="class-chip class-chip--none">Ohne Klasse · nur Admins</span>;
  }
  const labels = classIds.map((id) => classOptions.find((c) => c.id === id)?.label ?? "?");
  return (
    <span className="class-chips">
      {labels.map((label, i) => (
        <span key={classIds[i]} className="class-chip">{label}</span>
      ))}
    </span>
  );
}

/** Shared fields used by both the create form and the inline edit form. */
function FolderFormFields({
  form,
  setForm,
  classOptions,
  ownClassId,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  classOptions: ClassOption[];
  ownClassId?: string;
}) {
  // Only active (and legacy) cohorts are assignable; alumni/archived/expired/future are hidden.
  // Keep any class already selected on the album, even if it has since aged out.
  const selectable = classOptions.filter(
    (c) => c.status === "active" || c.status === "legacy" || form.classIds.includes(c.id),
  );
  // Primary = the teacher's own class + whatever is already selected; the rest sit
  // behind an explicit "weitere Klassen berechtigen" toggle to keep the form tidy.
  const isPrimary = (c: ClassOption) => form.classIds.includes(c.id) || c.id === ownClassId;
  const primary = selectable.filter(isPrimary);
  const others = selectable.filter((c) => !isPrimary(c));
  const [showAll, setShowAll] = useState(primary.length === 0);
  const nameId = useId();

  const renderChip = (c: ClassOption) => {
    const active = form.classIds.includes(c.id);
    return (
      <button
        key={c.id}
        type="button"
        className={`class-toggle${active ? " active" : ""}`}
        aria-pressed={active}
        onClick={() =>
          setForm((p) => ({
            ...p,
            classIds: active ? p.classIds.filter((id) => id !== c.id) : [...p.classIds, c.id],
          }))
        }
      >
        {chipLabel(c)}
      </button>
    );
  };

  return (
    <div className="album-form">
      <div className="album-field album-field--name">
        <label className="album-label" htmlFor={nameId}>Albumname</label>
        <input
          id={nameId}
          className="album-name-input"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="Name (z.B. Klassenfahrt 2025)"
          required
          autoFocus
        />
      </div>

      <div className="album-body">
      <div className="album-field album-classes">
        <div className="album-label-row">
          <span className="album-label">Für welche Klassen?</span>
          <Link to="/verwaltung/klassen" className="album-label-link">Klassen verwalten</Link>
        </div>
        {selectable.length === 0 ? (
          <p className="album-note">
            Noch keine aktiven Klassen. Lege sie unter „Klassen verwalten“ an.
          </p>
        ) : (
          <div className="class-toggle-row" role="group" aria-label="Klassen">
            {primary.map(renderChip)}
            {showAll && others.map(renderChip)}
            {others.length > 0 && !showAll && (
              <button
                type="button"
                className="class-add-more"
                onClick={() => setShowAll(true)}
                title="Weitere Klassen berechtigen"
              >
                + weitere Klassen
              </button>
            )}
          </div>
        )}
        {form.classIds.length === 0 && selectable.length > 0 && (
          <p className="album-hint">
            <span className="album-hint-dot" aria-hidden="true" />
            Ohne Klasse sehen nur Admins dieses Album.
          </p>
        )}
      </div>

      <div className="album-field album-dates">
        <span className="album-label">Zeitraum <span className="album-label-opt">optional</span></span>
        <div className="album-rangepill">
          <svg className="album-rangepill-icon" width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2.5" />
            <line x1="3" y1="9.5" x2="21" y2="9.5" />
            <line x1="8" y1="3" x2="8" y2="6.5" />
            <line x1="16" y1="3" x2="16" y2="6.5" />
          </svg>
          <input
            type="date"
            className="album-rangepill-input"
            aria-label="Von"
            value={form.startDate}
            onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
            onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
          />
          <span className="album-rangepill-arrow" aria-hidden="true">→</span>
          <input
            type="date"
            className="album-rangepill-input"
            aria-label="Bis"
            value={form.endDate}
            min={form.startDate || undefined}
            onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
            onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
          />
        </div>
      </div>
      </div>
    </div>
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
    startDate: toDateInput(folder.startDate),
    endDate: toDateInput(folder.endDate),
    classIds: folder.classIds ?? [],
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
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        classIds: form.classIds,
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
        <ClassChips classIds={folder.classIds ?? []} classOptions={classOptions} />
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
          <p className="muted">Dieses Album hat noch keine freigegebenen Fotos.</p>
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
  const { me } = useOutletContext<OutletCtx>();
  // A new album defaults to the admin's own class (teachers are usually assigned to one).
  const newAlbumForm = (): FormState =>
    me?.classId ? { ...emptyForm, classIds: [me.classId] } : emptyForm;
  const [folders, setFolders] = useState<Folder[]>([]);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<FormState>(newAlbumForm);
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
        startDate: createForm.startDate || null,
        endDate: createForm.endDate || null,
        classIds: createForm.classIds,
      });
      await reload();
      setCreateForm(newAlbumForm());
      setShowCreate(false);
    } catch (e: any) {
      setCreateErr(e.message ?? "Fehler beim Anlegen.");
    } finally {
      setCreateBusy(false);
    }
  }

  if (loading) return <p className="muted">Lädt Alben …</p>;
  if (error) return <p className="err">Alben konnten nicht geladen werden.</p>;

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>Alben verwalten</h2>
        <button
          style={{ width: "auto", margin: 0 }}
          onClick={() =>
            setShowCreate((v) => {
              if (!v) setCreateForm(newAlbumForm());
              return !v;
            })
          }
        >
          {showCreate ? "Abbrechen" : "+ Neues Album"}
        </button>
      </div>

      {showCreate && (
        <div className="album-create-card">
          <div className="album-create-head">
            <span className="album-create-kicker">Neu</span>
            <h3 className="album-create-title">Neues Album anlegen</h3>
          </div>
          <form onSubmit={handleCreate} className="album-create-form">
            <FolderFormFields form={createForm} setForm={setCreateForm} classOptions={classOptions} ownClassId={me?.classId ?? undefined} />
            {createErr && <p className="err">{createErr}</p>}
            <div className="album-create-footer">
              <button type="submit" className="album-submit" disabled={createBusy || !createForm.name.trim()}>
                {createBusy ? "Anlegen …" : "Album anlegen"}
              </button>
            </div>
          </form>
        </div>
      )}

      {!folders.length && <p className="muted">Noch keine Alben vorhanden.</p>}

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
