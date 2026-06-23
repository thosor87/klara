import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api, type TrashItem } from "../api";

type OutletCtx = { refreshPending: () => void };

export function Trash() {
  const { refreshPending } = useOutletContext<OutletCtx>();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(false);
    api.getTrash()
      .then((data) => {
        setItems(data);
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }

  useEffect(() => { load(); }, []);

  async function handleRestore(itemId: string) {
    setBusy(itemId); setMsg("");
    try {
      await api.restoreTrashItem(itemId);
      setMsg("Foto wiederhergestellt — es wartet jetzt in der Freigabe-Warteschlange.");
      refreshPending();
      load();
    } catch {
      setMsg("Wiederherstellen fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="muted">Lädt Papierkorb …</p>;
  if (error) return <p className="err">Papierkorb konnte nicht geladen werden.</p>;

  return (
    <div className="trash-view">
      <div className="reports-header">
        <h2>Papierkorb</h2>
        <span className="muted" style={{ fontSize: ".9rem" }}>
          {items.length === 0 ? "Leer" : `${items.length} Foto${items.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      <div className="trash-notice">
        <TrashIcon />
        <p>
          Fotos im Papierkorb werden nach <strong>30 Tagen</strong> automatisch und dauerhaft gelöscht
          — inklusive der Bilddateien.
        </p>
      </div>

      {msg && <p className="approval-msg">{msg}</p>}

      {items.length === 0 && (
        <p className="muted empty-hint">Der Papierkorb ist leer.</p>
      )}

      <div className="trash-grid">
        {items.map((item) => (
          <div key={item.id} className="trash-card">
            <div className="trash-thumb-wrap">
              <img
                src={item.thumbUrl}
                alt={item.caption || "Foto"}
                className="trash-thumb"
                loading="lazy"
              />
              <span className={`trash-days-badge${item.daysLeft <= 3 ? " trash-days-badge--urgent" : ""}`}>
                noch {item.daysLeft}d
              </span>
            </div>
            <div className="trash-info">
              <div className="approval-folder">{item.folderName}</div>
              {item.caption && (
                <div className="approval-caption">{item.caption}</div>
              )}
              <button
                className="btn-approve btn-inline"
                style={{ marginTop: ".6rem", fontSize: ".85rem", padding: ".4rem .85rem" }}
                disabled={busy === item.id}
                onClick={() => handleRestore(item.id)}
              >
                {busy === item.id ? "…" : "Wiederherstellen"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20"
      fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
