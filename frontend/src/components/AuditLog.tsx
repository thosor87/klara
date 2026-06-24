import { useState } from "react";
import { api, type AuditEntry } from "../api";

function fmt(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("de-DE", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function icon(action: string): string {
  if (action.startsWith("login")) return "🔑";
  if (action.startsWith("user")) return "👤";
  if (action.startsWith("folder")) return "📁";
  if (action.startsWith("item")) return "🖼️";
  if (action.startsWith("report")) return "🚩";
  if (action.startsWith("document")) return "📄";
  return "•";
}

/**
 * Discreet audit log — a collapsed "Protokoll" section at the bottom of the user
 * admin page. Loads lazily on first open; can expand from 200 to 500 entries.
 */
export function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(200);
  const [open, setOpen] = useState(false);

  async function load(n: number) {
    setLoading(true);
    try {
      setEntries(await api.getAudit(n));
      setLimit(n);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  function onToggle(e: React.SyntheticEvent<HTMLDetailsElement>) {
    const isOpen = e.currentTarget.open;
    setOpen(isOpen);
    if (isOpen && entries === null) load(200);
  }

  return (
    <details className="audit-log" onToggle={onToggle}>
      <summary className="audit-summary">
        Protokoll <span className="muted">— wer hat was gemacht</span>
      </summary>
      {open && (
        <div className="audit-body">
          {loading && entries === null && <p className="muted">Lädt …</p>}
          {entries && entries.length === 0 && <p className="muted">Noch keine Einträge.</p>}
          {entries && entries.length > 0 && (
            <ul className="audit-list">
              {entries.map((e) => (
                <li key={e.id} className="audit-row">
                  <span className="audit-icon" aria-hidden="true">{icon(e.action)}</span>
                  <span className="audit-main">
                    <span className="audit-text">{e.summary}</span>
                    <span className="audit-meta">{e.actorEmail} · {fmt(e.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {entries && entries.length >= limit && limit < 500 && (
            <button className="btn-xs" onClick={() => load(500)} disabled={loading}>
              Mehr anzeigen (bis 500)
            </button>
          )}
        </div>
      )}
    </details>
  );
}
