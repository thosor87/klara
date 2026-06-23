import { useEffect, useState } from "react";
import { api, type Domain, type ClassOption, type ClassStatus } from "../api";
import { einschulungsjahrOptions } from "../dates";
import { useConfirm } from "./ConfirmDialog";

/** Maps a class lifecycle status to its German pill label + CSS modifier. */
function statusPill(status: ClassStatus): { text: string; cls: string } {
  switch (status) {
    case "active": return { text: "Aktiv", cls: "class-status--active" };
    case "alumni": return { text: "Ehemalige", cls: "class-status--alumni" };
    case "archived": return { text: "Archiviert", cls: "class-status--archived" };
    case "expired": return { text: "Zur Löschung", cls: "class-status--expired" };
    case "future": return { text: "Zukünftig", cls: "class-status--future" };
    case "legacy": return { text: "Alt", cls: "class-status--legacy" };
  }
}

export function DomainsCard() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const { ask, dialog } = useConfirm();

  useEffect(() => {
    api
      .getDomains()
      .then((d) => {
        setDomains(d);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const value = input.trim().toLowerCase();
    if (!value || busy) return;
    setBusy(true);
    setErr("");
    try {
      await api.addDomain(value);
      setDomains((prev) => (prev.includes(value) ? prev : [...prev, value].sort()));
      setInput("");
    } catch (e: any) {
      setErr(e.message ?? "Hinzufügen fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(domain: string) {
    const ok = await ask({
      title: "Domain entfernen",
      message: `Domain „${domain}" wirklich entfernen? Adressen dieser Domain können sich dann nicht mehr neu anmelden.`,
      confirmLabel: "Entfernen",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setErr("");
    try {
      await api.removeDomain(domain);
      setDomains((prev) => prev.filter((d) => d !== domain));
    } catch (e: any) {
      setErr(e.message ?? "Entfernen fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-card">
      {dialog}
      <h2>Erlaubte Login-Domains</h2>
      <p className="muted settings-hint">
        Adressen dieser Domains dürfen sich anmelden und erhalten einen Code. Alle anderen brauchen
        einen Allowlist-Eintrag unter Nutzer.
      </p>

      <form className="settings-add-form" onSubmit={add}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="grundschule-xy.de"
          aria-label="Domain hinzufügen"
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Hinzufügen
        </button>
      </form>

      {err && <p className="err">{err}</p>}

      {loading ? (
        <p className="muted">Lädt …</p>
      ) : error ? (
        <p className="err">Domains konnten nicht geladen werden.</p>
      ) : domains.length === 0 ? (
        <p className="muted">Noch keine Domains hinterlegt.</p>
      ) : (
        <ul className="settings-list">
          {domains.map((d) => (
            <li key={d} className="settings-list-row">
              <span className="settings-list-label">{d}</span>
              <button className="settings-remove-btn" onClick={() => remove(d)} disabled={busy}>
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Inline editor to set / change a class's Zug + Einschulungsjahr (e.g. convert a legacy class). */
function ClassEditRow({
  option,
  busy,
  onSave,
  onCancel,
}: {
  option: ClassOption;
  busy: boolean;
  onSave: (id: string, body: { track: string; startYear: number }) => void;
  onCancel: () => void;
}) {
  const years = einschulungsjahrOptions();
  const [track, setTrack] = useState(option.track);
  const [startYear, setStartYear] = useState<string>(
    option.startYear != null ? String(option.startYear) : "",
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!startYear || busy) return;
    onSave(option.id, { track: track.trim(), startYear: Number(startYear) });
  }

  return (
    <li className="settings-list-row settings-list-row--editing">
      <form className="class-edit-form" onSubmit={submit}>
        <label className="form-field">
          <span className="form-label">Zug</span>
          <input
            type="text"
            value={track}
            onChange={(e) => setTrack(e.target.value)}
            placeholder="z.B. m — leer = Regelklasse"
          />
        </label>
        <label className="form-field">
          <span className="form-label">Einschulungsjahr</span>
          <select value={startYear} onChange={(e) => setStartYear(e.target.value)} required>
            <option value="">— wählen —</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <div className="dialog-actions" style={{ marginTop: 0 }}>
          <button type="button" className="btn-ghost-dark" onClick={onCancel} disabled={busy}>
            Abbrechen
          </button>
          <button type="submit" style={{ width: "auto" }} disabled={busy || !startYear}>
            Speichern
          </button>
        </div>
      </form>
    </li>
  );
}

export function ClassesCard() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [track, setTrack] = useState("");
  const [startYear, setStartYear] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const { ask, dialog } = useConfirm();
  const years = einschulungsjahrOptions();

  useEffect(() => {
    api
      .getAdminClassOptions()
      .then((c) => {
        setClasses(c);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  function upsert(option: ClassOption) {
    setClasses((prev) => {
      const exists = prev.find((c) => c.id === option.id);
      return exists ? prev.map((c) => (c.id === option.id ? option : c)) : [...prev, option];
    });
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!startYear || busy) return;
    setBusy(true);
    setErr("");
    try {
      const option = await api.addClassOption({ track: track.trim(), startYear: Number(startYear) });
      upsert(option);
      setTrack("");
      setStartYear("");
    } catch (e: any) {
      setErr(e.message ?? "Hinzufügen fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: string, body: { track: string; startYear: number }) {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const option = await api.updateClassOption(id, body);
      upsert(option);
      setEditingId(null);
    } catch (e: any) {
      setErr(e.message ?? "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(option: ClassOption) {
    const ok = await ask({
      title: "Klasse entfernen",
      message: `Klasse „${option.label}" wirklich entfernen? Bestehende Alben verlieren die Zuordnung zu dieser Klasse.`,
      confirmLabel: "Entfernen",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setErr("");
    try {
      await api.removeClassOption(option.id);
      setClasses((prev) => prev.filter((c) => c.id !== option.id));
    } catch (e: any) {
      setErr(e.message ?? "Entfernen fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-card">
      {dialog}
      <h2>Klassen</h2>
      <p className="muted settings-hint">
        Eine Klasse ist eine stabile Gruppe aus <strong>Zug</strong> und{" "}
        <strong>Einschulungsjahr</strong>. Das Stufen-Label (z.&nbsp;B. „2m") und der Status
        ergeben sich automatisch aus dem Schuljahr.
      </p>

      <form className="settings-add-form class-add-form" onSubmit={add}>
        <label className="form-field">
          <span className="form-label">Zug</span>
          <input
            type="text"
            value={track}
            onChange={(e) => setTrack(e.target.value)}
            placeholder="z.B. m — leer = Regelklasse"
            aria-label="Zug"
          />
        </label>
        <label className="form-field">
          <span className="form-label">Einschulungsjahr</span>
          <select value={startYear} onChange={(e) => setStartYear(e.target.value)} aria-label="Einschulungsjahr">
            <option value="">— wählen —</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy || !startYear}>
          Anlegen
        </button>
      </form>

      {err && <p className="err">{err}</p>}

      {loading ? (
        <p className="muted">Lädt …</p>
      ) : error ? (
        <p className="err">Klassen konnten nicht geladen werden.</p>
      ) : classes.length === 0 ? (
        <p className="muted">Noch keine Klassen hinterlegt.</p>
      ) : (
        <ul className="settings-list">
          {classes.map((c) => {
            if (editingId === c.id) {
              return (
                <ClassEditRow
                  key={c.id}
                  option={c}
                  busy={busy}
                  onSave={saveEdit}
                  onCancel={() => setEditingId(null)}
                />
              );
            }
            const pill = statusPill(c.status);
            return (
              <li key={c.id} className="settings-list-row">
                <span className="settings-list-label class-row-label">{c.label}</span>
                <span className={`class-status-pill ${pill.cls}`}>{pill.text}</span>
                {c.status === "active" && c.schoolYear && (
                  <span className="muted class-status-meta">{c.schoolYear}</span>
                )}
                {c.status === "legacy" && (
                  <span className="muted class-status-meta">Einschulungsjahr setzen</span>
                )}
                <div className="class-row-actions">
                  <button className="settings-remove-btn settings-edit-btn" onClick={() => setEditingId(c.id)} disabled={busy}>
                    Bearbeiten
                  </button>
                  <button className="settings-remove-btn" onClick={() => remove(c)} disabled={busy}>
                    Entfernen
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function AdminClasses() {
  return (
    <div className="settings-page">
      <div className="page-head">
        <p className="page-kicker">Verwaltung</p>
        <h1 className="page-title">Klassen</h1>
      </div>
      <ClassesCard />
    </div>
  );
}
