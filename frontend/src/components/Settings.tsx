import { useEffect, useState } from "react";
import { api, type Domain, type ClassOption } from "../api";

function DomainsCard() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

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
    if (!window.confirm(`Domain „${domain}" wirklich entfernen?`)) return;
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
      <h2>Erlaubte Domains</h2>
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

function ClassesCard() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

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

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const label = input.trim();
    if (!label || busy) return;
    setBusy(true);
    setErr("");
    try {
      const option = await api.addClassOption(label);
      setClasses((prev) => {
        const exists = prev.find((c) => c.id === option.id);
        return exists ? prev.map((c) => (c.id === option.id ? option : c)) : [...prev, option];
      });
      setInput("");
    } catch (e: any) {
      setErr(e.message ?? "Hinzufügen fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(option: ClassOption) {
    if (!window.confirm(`Klasse „${option.label}" wirklich entfernen?`)) return;
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
      <h2>Klassen</h2>
      <p className="muted settings-hint">
        Diese Bezeichnungen stehen beim Anlegen eines Ordners im Klassen-Auswahlfeld zur Verfügung.
      </p>

      <form className="settings-add-form" onSubmit={add}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="z. B. 3. Klasse"
          aria-label="Klasse hinzufügen"
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Hinzufügen
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
          {classes.map((c) => (
            <li key={c.id} className="settings-list-row">
              <span className="settings-list-label">{c.label}</span>
              <button className="settings-remove-btn" onClick={() => remove(c)} disabled={busy}>
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AdminDomains() {
  return (
    <div className="settings-page">
      <div className="page-head">
        <p className="page-kicker">Verwaltung</p>
        <h1 className="page-title">Domains</h1>
      </div>
      <DomainsCard />
    </div>
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
